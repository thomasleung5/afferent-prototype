// Calc Engine — single source of truth for cost-of-service calculations.
//
// Chain:
//   POSITIONS  →  per-dept direct $ + productive hours       →  direct FBHR
//   CAP_POOLS  →  per-dept recoverable indirect $            →  indirect rate ($/hr)
//   FBHR       =  direct FBHR + indirect rate
//   SERVICES   →  cost = hours × FBHR(dept)
//
// Everything downstream (Service Costs, Policy, Fee Schedule, Reconcile) reads
// from this engine. Edits to positions or CAP allocations propagate through.
//
// All inputs and overrides are read from window.AFFERENT_OVERRIDES (a small
// reactive store) so screens can mutate without re-running the engine manually.

(function(){
  const DATA = window.AFFERENT_DATA;
  const EXT  = window.AFFERENT_EXT;

  // ---------- Reactive override store ----------
  // Anything a screen mutates lives here. computeModel() reads it.
  // listeners are notified on every change so screens re-render.
  const initialOverrides = {
    positions:   EXT.POSITIONS.map(p => ({ ...p })),  // editable copy
    capPools:    EXT.CAP_POOLS.map(p => ({ ...p })),  // editable copy
    operating:   (EXT.OPERATING_COSTS || []).map(o => ({ ...o })), // operating costs (dept-direct, non-labor)
    services:    DATA.SERVICES.map(s => ({ ...s })),  // editable copy (hours, target, optional roleMix)
    feePolicies: {},                                  // { [serviceId]: { target, subsidy, notes } }
    policyDefaults: { defaultTarget: 100, rounding: 5 },
    rateMode:    "blended",                           // "blended" (dept FBHR) or "role" (role-mix path)
  };

  const store = {
    state: initialOverrides,
    listeners: new Set(),
    get() { return this.state; },
    update(patch) {
      this.state = { ...this.state, ...patch };
      this.listeners.forEach(fn => fn(this.state));
    },
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
  };

  // ---------- Pure compute ----------

  // Pool recoverability factor — drives how much of the pool flows into fee-eligible cost.
  function recoverabilityFactor(pool) {
    const r = (pool.recoverability || "").toLowerCase();
    if (r.includes("excluded")) return 0;
    if (r.includes("legal review")) return 0.5;       // legal-review pending: half by default
    if (r.includes("out of fee")) return 0;
    if (r.includes("partial")) return 0.6;
    if (r.includes("recoverable where")) return 0.7;
    if (r.includes("recoverable")) return 1.0;
    return 0.5;                                        // unknown: half
  }

  // Per-dept direct labor + productive hours from POSITIONS
  function rollupSalary(positions) {
    const byDept = {};
    positions.forEach(p => {
      const d = p.dept;
      if (!byDept[d]) byDept[d] = { dept: d, direct: 0, hours: 0, fte: 0, count: 0 };
      const directCost = p.fte * (p.salary + p.benefits);
      const productiveHours = p.fte * p.hours;
      byDept[d].direct += directCost;
      byDept[d].hours  += productiveHours;
      byDept[d].fte    += p.fte;
      byDept[d].count  += 1;
    });
    Object.values(byDept).forEach(d => {
      d.directFBHR = d.hours > 0 ? d.direct / d.hours : 0;
    });
    return byDept;
  }

  // Per-dept recoverable indirect $ from CAP_POOLS
  // PRIMARY PATH: deterministic allocation via window.AFFERENT_CAP engine
  //   For each pool: amount × (driver[basis] / Σdriver[basis]) × recoverable%
  // FALLBACK: legacy heuristic (FTE-share × recoverability factor).
  function rollupCAP(capPools, salaryByDept) {
    const feeDepts = ["PLAN", "BLDG", "ENG"];

    // Try deterministic engine first
    if (window.AFFERENT_CAP) {
      const m = window.AFFERENT_CAP.computeModel();
      const indirect = { PLAN: 0, BLDG: 0, ENG: 0 };
      m.allocRows.forEach(r => {
        if (indirect[r.dept] != null) indirect[r.dept] += r.allocated;
      });
      return {
        indirectByDept: indirect,
        totalPool: m.totals.totalCAP,
        totalRecoverable: m.totals.totalAllocated,
        deterministic: true,
        warnings: m.warnings,
      };
    }

    // Legacy fallback
    const totalFeeFTE = feeDepts.reduce((a, d) => a + (salaryByDept[d]?.fte || 0), 0);
    const indirect = { PLAN: 0, BLDG: 0, ENG: 0 };
    let totalRecoverable = 0, totalPool = 0;

    capPools.forEach(pool => {
      const factor = recoverabilityFactor(pool);
      const recoverable = pool.amount * factor;
      totalPool += pool.amount;
      totalRecoverable += recoverable;
      if (totalFeeFTE === 0) return;
      feeDepts.forEach(d => {
        const fteShare = (salaryByDept[d]?.fte || 0) / totalFeeFTE;
        indirect[d] += recoverable * fteShare;
      });
    });

    return { indirectByDept: indirect, totalPool, totalRecoverable };
  }

  // Per-dept operating $ from OPERATING_COSTS
  // SHARED:CDS lines split across PLAN/BLDG/ENG proportional to productive hours.
  function rollupOperating(operating, salaryByDept) {
    const feeDepts = ["PLAN", "BLDG", "ENG"];
    const byDept = { PLAN: 0, BLDG: 0, ENG: 0 };
    const includedLines = { PLAN: [], BLDG: [], ENG: [] };
    const excludedLines = { PLAN: [], BLDG: [], ENG: [] };
    let totalOperating = 0, totalIncluded = 0, totalExcluded = 0;

    const totalFeeHours = feeDepts.reduce((a, d) => a + (salaryByDept[d]?.hours || 0), 0);

    operating.forEach(o => {
      totalOperating += o.amount;
      if (!o.include) {
        totalExcluded += o.amount;
        if (o.dept && o.dept.startsWith("SHARED")) {
          feeDepts.forEach(d => excludedLines[d].push({ ...o, allocated: 0, share: 0 }));
        } else if (o.dept in byDept) {
          excludedLines[o.dept].push({ ...o, allocated: 0 });
        }
        return;
      }
      totalIncluded += o.amount;
      if (o.dept && o.dept.startsWith("SHARED")) {
        if (totalFeeHours === 0) return;
        feeDepts.forEach(d => {
          const share = (salaryByDept[d]?.hours || 0) / totalFeeHours;
          const allocated = o.amount * share;
          byDept[d] += allocated;
          includedLines[d].push({ ...o, allocated, share });
        });
      } else if (o.dept in byDept) {
        byDept[o.dept] += o.amount;
        includedLines[o.dept].push({ ...o, allocated: o.amount });
      }
    });

    return { byDept, includedLines, excludedLines, totalOperating, totalIncluded, totalExcluded };
  }

  // Final FBHR per dept
  // FBHR = Direct $/hr + Operating $/hr + CAP $/hr
  function computeFBHR(salaryByDept, capRollup, opRollup) {
    const fbhr = {};
    Object.keys(salaryByDept).forEach(d => {
      const sal = salaryByDept[d];
      const indirect = capRollup.indirectByDept[d] || 0;
      const indirectRate = sal.hours > 0 ? indirect / sal.hours : 0;
      const operating = opRollup ? (opRollup.byDept[d] || 0) : 0;
      const operatingRate = sal.hours > 0 ? operating / sal.hours : 0;
      fbhr[d] = {
        dept: d,
        direct: sal.direct,
        directFBHR: sal.directFBHR,
        productiveHours: sal.hours,
        operating,
        operatingRate,
        indirect,
        indirectRate,
        fbhr: sal.directFBHR + operatingRate + indirectRate,
      };
    });
    return fbhr;
  }

  // Per-role $/hr — direct rate for a single position + dept's operating + CAP rates
  function computeRoleRates(positions, fbhrByDept) {
    const ROLES = EXT.ROLES || [];
    const byTitle = {};
    positions.forEach(p => { byTitle[p.title] = p; });
    return ROLES.map(role => {
      const pos = byTitle[role.positionTitle];
      const f = fbhrByDept[role.dept];
      if (!pos || !f) return { ...role, directRate: 0, operatingRate: 0, indirectRate: 0, fbhr: 0, valid: false };
      const directRate = pos.hours > 0 ? (pos.salary + pos.benefits) / pos.hours : 0;
      return {
        ...role,
        directRate,
        operatingRate: f.operatingRate,
        indirectRate: f.indirectRate,
        fbhr: directRate + f.operatingRate + f.indirectRate,
        valid: true,
      };
    });
  }

  // Per-service cost
  // Two paths:
  //   blended: hours × dept FBHR
  //   role:    Σ (roleHours × roleFBHR) when service.roleMix exists, else fall back to blended
  function computeServiceCosts(services, fbhrByDept, roleRates, rateMode) {
    const roleById = {};
    roleRates.forEach(r => { roleById[r.id] = r; });
    return services.map(s => {
      const f = fbhrByDept[s.dept];
      const useRole = rateMode === "role" && Array.isArray(s.roleMix) && s.roleMix.length > 0;
      if (useRole) {
        let cost = 0, directComponent = 0, indirectComponent = 0, operatingComponent = 0, totalHours = 0;
        const breakdown = s.roleMix.map(m => {
          const r = roleById[m.roleId];
          const hrs = m.hours || 0;
          totalHours += hrs;
          if (!r) return { roleId: m.roleId, hours: hrs, valid: false, cost: 0 };
          const lineCost = hrs * r.fbhr;
          cost += lineCost;
          directComponent   += hrs * r.directRate;
          operatingComponent+= hrs * r.operatingRate;
          indirectComponent += hrs * r.indirectRate;
          return { roleId: m.roleId, title: r.title, hours: hrs, fbhr: r.fbhr, cost: lineCost, valid: true };
        });
        return {
          ...s,
          cost: Math.round(cost),
          calculated: true,
          rateMode: "role",
          directComponent: Math.round(directComponent),
          operatingComponent: Math.round(operatingComponent),
          indirectComponent: Math.round(indirectComponent),
          fbhrUsed: totalHours > 0 ? cost / totalHours : 0,
          roleBreakdown: breakdown,
          totalHours,
        };
      }
      if (!f) return { ...s, cost: s.cost, calculated: false, rateMode: "blended" };
      const cost = Math.round(s.hours * f.fbhr);
      return {
        ...s,
        cost,                       // ← overrides the seed s.cost with calculated value
        calculated: true,
        rateMode: "blended",
        directComponent:    Math.round(s.hours * f.directFBHR),
        operatingComponent: Math.round(s.hours * f.operatingRate),
        indirectComponent:  Math.round(s.hours * f.indirectRate),
        fbhrUsed: f.fbhr,
      };
    });
  }

  // Per-service adopted fee from policy
  function computeAdoptedFees(servicesWithCost, feePolicies, defaults) {
    const step = defaults.rounding || 5;
    const round = (v) => step <= 1 ? Math.round(v) : Math.round(v / step) * step;
    return servicesWithCost.map(s => {
      const p = feePolicies[s.id] || { target: s.target ?? defaults.defaultTarget, subsidy: false, notes:"" };
      const target = p.target ?? defaults.defaultTarget;
      const adopted = round(s.cost * target / 100);
      return {
        ...s,
        target, subsidy: !!p.subsidy, notes: p.notes || "",
        adopted, delta: adopted - (s.fee || 0),
        recoveryNow: s.cost > 0 ? ((s.fee || 0) / s.cost) * 100 : 0,
      };
    });
  }

  // ---------- Top-level model ----------
  function computeModel() {
    const s = store.state;
    const salary    = rollupSalary(s.positions);
    const cap       = rollupCAP(s.capPools, salary);
    const operating = rollupOperating(s.operating || [], salary);
    const fbhr      = computeFBHR(salary, cap, operating);
    const roleRates = computeRoleRates(s.positions, fbhr);
    const costs     = computeServiceCosts(s.services, fbhr, roleRates, s.rateMode || "blended");
    const adopted   = computeAdoptedFees(costs, s.feePolicies, s.policyDefaults);

    // Department rollups
    const byDept = {};
    adopted.forEach(svc => {
      const d = svc.dept;
      if (!byDept[d]) byDept[d] = { dept: d, totalCost: 0, currentRev: 0, fullRev: 0, count: 0 };
      const annualCost = svc.cost * (svc.volume || 0);
      const annualCur  = (svc.fee  || 0) * (svc.volume || 0);
      const annualNew  = svc.adopted * (svc.volume || 0);
      byDept[d].totalCost  += annualCost;
      byDept[d].currentRev += annualCur;
      byDept[d].fullRev    += annualNew;
      byDept[d].count++;
    });
    Object.values(byDept).forEach(d => {
      d.recovery = d.totalCost > 0 ? (d.currentRev / d.totalCost) * 100 : 0;
      d.fbhr = fbhr[d.dept]?.fbhr || 0;
    });

    return {
      salary, cap, operating, fbhr, roleRates, rateMode: s.rateMode || "blended", services: adopted, byDept,
      totals: {
        totalCost: Object.values(byDept).reduce((a,d) => a + d.totalCost, 0),
        currentRev: Object.values(byDept).reduce((a,d) => a + d.currentRev, 0),
        fullRev:    Object.values(byDept).reduce((a,d) => a + d.fullRev, 0),
      },
    };
  }

  // ---------- Hook ----------
  // useModel() — subscribe a component to recomputed model on any store change.
  function useModel() {
    const [tick, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => store.subscribe(() => force()), []);
    return React.useMemo(() => computeModel(), [tick]); // eslint-disable-line
  }

  // Mutators — small typed helpers screens call.
  const actions = {
    updatePosition(idx, patch) {
      const positions = store.state.positions.map((p, i) => i === idx ? { ...p, ...patch } : p);
      store.update({ positions });
    },
    addPosition(p) {
      store.update({ positions: [...store.state.positions, p] });
    },
    removePosition(idx) {
      store.update({ positions: store.state.positions.filter((_, i) => i !== idx) });
    },
    updateCapPool(idx, patch) {
      const capPools = store.state.capPools.map((p, i) => i === idx ? { ...p, ...patch } : p);
      store.update({ capPools });
    },
    updateService(id, patch) {
      const services = store.state.services.map(s => s.id === id ? { ...s, ...patch } : s);
      store.update({ services });
    },
    addService(s) {
      store.update({ services: [...store.state.services, s] });
    },
    removeService(id) {
      store.update({ services: store.state.services.filter(s => s.id !== id) });
    },
    updatePolicy(id, patch) {
      const feePolicies = { ...store.state.feePolicies, [id]: { ...(store.state.feePolicies[id] || {}), ...patch } };
      store.update({ feePolicies });
    },
    updatePolicyDefaults(patch) {
      store.update({ policyDefaults: { ...store.state.policyDefaults, ...patch } });
    },
    updateOperating(id, patch) {
      const operating = (store.state.operating || []).map(o => o.id === id ? { ...o, ...patch } : o);
      store.update({ operating });
    },
    addOperating(o) {
      store.update({ operating: [...(store.state.operating || []), o] });
    },
    removeOperating(id) {
      store.update({ operating: (store.state.operating || []).filter(o => o.id !== id) });
    },
    setRateMode(mode) {
      store.update({ rateMode: mode === "role" ? "role" : "blended" });
    },
    reset() {
      store.update(initialOverrides);
    },
  };

  window.AFFERENT_ENGINE = {
    store, actions, useModel,
    // also expose pure helpers for non-React code paths
    computeModel, rollupSalary, rollupCAP, rollupOperating, computeFBHR, computeRoleRates, computeServiceCosts,
    recoverabilityFactor,
  };
})();
