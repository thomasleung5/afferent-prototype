// cap-engine.jsx — NBS-style Cost Allocation Plan engine.
//
// PURPOSE: Allocate indirect (overhead) cost pools to direct departments.
// SCOPE:   Allocation only. No recoverability, no fees, no policy.
//
// METHOD:  STEP-DOWN (sequential elimination).
//
// Each pool starts on its home cost center (an indirect department).
// Indirect departments are processed in a defined sequence (`stepOrder`).
// When dept I is "stepped down", every pool currently sitting on I is
// distributed across all departments BELOW I in the sequence (remaining
// indirects + all directs) using THAT pool's basis. I is then closed —
// receives no further allocations. After every indirect dept has been
// stepped down, all cost has settled on direct departments.
//
//   For i = 0..N-1 (indirect depts in stepOrder):
//     For each pool p with running[p][I_i] > 0:
//       receivers   = stepOrder[i+1..] ∪ directDepts
//       totalDriver = Σ DRIVER[r][p.basis] for r in receivers
//       For each r in receivers:
//         running[p][r] += running[p][I_i] × DRIVER[r][p.basis] / totalDriver
//       running[p][I_i] = 0
//
// DIRECT-charge pools place 100% on their target dept up front and skip
// step-down (no basis needed).
//
// Conservation: Σ_P P.amount  ===  Σ_d_direct Σ_P running[P][d]
// (verified up to floating-point rounding).
//
// Outputs preserved for the UI:
//   alloc1        — initial placement (pool sits on its home center)
//   alloc2        — final allocation after all step-downs
//   stepOrder     — array of indirect depts in processing order
//   stepEvents    — per-(step, pool) trace of what was distributed where
//   allocRows, byPool, deptOH, byCenter, matrix — final outputs
//
// Calc-engine consumes the deterministic per-direct-dept allocated $ via
// model.allocRows / model.deptOH.

(function(){
  const SEED = window.AFFERENT_CAP_DATA;

  // ---------- Reactive store ----------
  const initial = {
    departments: SEED.DEPARTMENTS.map((d, i) => ({ ...d, stepOrder: d.stepOrder ?? i })),
    bases:       SEED.BASES.map(b => ({ ...b })),
    centers:     SEED.CENTERS.map(c => ({ ...c })),
    pools:       SEED.POOLS.map(p => ({ ...p, _orig: p.amount })),
    drivers:     JSON.parse(JSON.stringify(SEED.DRIVERS)),
    sources:     { ...SEED.CAP_SOURCES },
  };

  const store = {
    state: initial,
    listeners: new Set(),
    update(patch) {
      this.state = { ...this.state, ...patch };
      this.listeners.forEach(fn => fn(this.state));
    },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  };

  // ---------- Helpers ----------
  const sumByDept = (drivers, depts, basis) =>
    depts.reduce((a, d) => a + ((drivers[d.id]?.[basis]) || 0), 0);

  const isDirect = (d) => d.kind === "direct";
  const isIndirect = (d) => d.kind === "indirect";

  // ---------- Pure compute ----------
  function computeModel() {
    const s = store.state;
    const depts = s.departments;
    const directDepts   = depts.filter(isDirect);
    const indirectDepts = depts.filter(isIndirect);

    // Step order: indirects sorted by stepOrder ascending.
    const stepOrder = [...indirectDepts].sort((a, b) =>
      (a.stepOrder ?? 0) - (b.stepOrder ?? 0)
    );

    // === INITIAL PLACEMENT ===
    // Each pool sits on its home indirect dept (centerId == indirect dept id),
    // OR on its target direct dept for direct-charge pools.
    const alloc1 = {};
    s.pools.forEach(p => {
      alloc1[p.id] = {};
      depts.forEach(d => alloc1[p.id][d.id] = 0);

      if (p.basis === "DIRECT") {
        if (p.directTo && depts.find(d => d.id === p.directTo)) {
          alloc1[p.id][p.directTo] = p.amount;
        }
        return;
      }

      // Home is the center — which equals an indirect dept id.
      const home = p.centerId;
      if (depts.find(d => d.id === home)) {
        alloc1[p.id][home] = p.amount;
      }
    });

    // running[p][d] starts as alloc1; we mutate it during step-down.
    const running = {};
    s.pools.forEach(p => {
      running[p.id] = {};
      depts.forEach(d => running[p.id][d.id] = alloc1[p.id][d.id]);
    });

    // === STEP-DOWN ===
    // Trace: stepEvents[i] = { stepIndex, fromDept, distributions: [{poolId, basis, amount, distributed: {deptId: $}}] }
    const stepEvents = [];

    for (let i = 0; i < stepOrder.length; i++) {
      const I = stepOrder[i];
      const remainingIndirects = stepOrder.slice(i + 1);
      const receivers = [...remainingIndirects, ...directDepts];

      const event = { stepIndex: i, fromDept: I.id, fromName: I.name, distributions: [] };

      s.pools.forEach(p => {
        const sitting = running[p.id][I.id];
        if (sitting <= 0) return;

        // Direct-charge pool sitting on an indirect dept: no basis to push it.
        // Leave it; engine will warn about leakage.
        if (p.basis === "DIRECT") return;

        const totalDriver = receivers.reduce((a, r) => a + (s.drivers[r.id]?.[p.basis] || 0), 0);
        if (totalDriver <= 0) return; // no receiver has the basis driver — leave residual

        const distributed = {};
        receivers.forEach(r => {
          const drv = s.drivers[r.id]?.[p.basis] || 0;
          if (drv <= 0) return;
          const share = sitting * (drv / totalDriver);
          running[p.id][r.id] += share;
          distributed[r.id] = share;
        });
        running[p.id][I.id] = 0;
        event.distributions.push({
          poolId: p.id,
          poolName: p.name,
          basis: p.basis,
          amount: sitting,
          totalDriver,
          distributed,
        });
      });

      if (event.distributions.length > 0) stepEvents.push(event);
    }

    const alloc2 = running;

    // === FINAL ROWS (direct depts only) ===
    const allocRows = [];
    s.pools.forEach(p => {
      directDepts.forEach(d => {
        const allocated = alloc2[p.id][d.id] || 0;
        // Initial-placement share for the explanation panel.
        const directBasisTotal = p.basis === "DIRECT" ? 0
          : sumByDept(s.drivers, depts, p.basis);
        const initialDriver = p.basis === "DIRECT" ? 0
          : (s.drivers[d.id]?.[p.basis] || 0);
        const initialShare = directBasisTotal > 0 ? initialDriver / directBasisTotal : 0;
        allocRows.push({
          poolId:   p.id,
          poolName: p.name,
          centerId: p.centerId,
          dept:     d.id,
          basis:    p.basis,
          driver:   initialDriver,
          driverTotal: directBasisTotal,
          shareDirect: initialShare,
          allocated,                    // FINAL $ to this direct dept
          recoverable: allocated,       // legacy alias
        });
      });
    });

    // === DEPT SUMMARY ===
    const deptOH = {};
    directDepts.forEach(d => {
      const total = allocRows.filter(r => r.dept === d.id).reduce((a, r) => a + r.allocated, 0);
      deptOH[d.id] = {
        dept: d.id,
        allocatedCAP:    total,
        recoverableCAP:  total,
        allocated:       total,
      };
    });

    // === MATRIX (pool × dept, FINAL) ===
    const matrix = {};
    s.pools.forEach(p => {
      matrix[p.id] = {};
      directDepts.forEach(d => matrix[p.id][d.id] = alloc2[p.id][d.id] || 0);
    });

    // === BY POOL totals ===
    const byPool = {};
    s.pools.forEach(p => {
      const allocatedToDirect = directDepts.reduce((a, d) => a + (alloc2[p.id][d.id] || 0), 0);
      // Residual = anything still on indirect depts (should be ~0 after step-down)
      const residual = indirectDepts.reduce((a, d) => a + (alloc2[p.id][d.id] || 0), 0);
      byPool[p.id] = {
        poolId: p.id,
        name: p.name,
        centerId: p.centerId,
        amount: p.amount,
        basis: p.basis,
        allocatedToDirect,
        residual,
        leakage: p.amount - allocatedToDirect,
      };
    });

    // === BY CENTER totals ===
    const byCenter = {};
    s.centers.forEach(c => {
      const pools = s.pools.filter(p => p.centerId === c.id);
      byCenter[c.id] = {
        centerId: c.id,
        name: c.name,
        totalCost: pools.reduce((a, p) => a + p.amount, 0),
        pools,
      };
    });

    // === TOTALS + VALIDATION ===
    const totalCAP        = s.pools.reduce((a, p) => a + p.amount, 0);
    const totalAllocated  = Object.values(deptOH).reduce((a, d) => a + d.allocatedCAP, 0);
    const unallocated     = totalCAP - totalAllocated;

    const warnings = [];
    s.pools.forEach(p => {
      if (!p.basis) {
        warnings.push({ kind:"basis-missing", poolId: p.id, msg:`"${p.name}" has no allocation basis.` });
      } else if (p.basis === "DIRECT") {
        if (!p.directTo) {
          warnings.push({ kind:"direct-target", poolId: p.id, msg:`"${p.name}" is direct-charge but has no target dept.` });
        } else {
          const target = depts.find(d => d.id === p.directTo);
          if (target && target.kind === "indirect") {
            warnings.push({ kind:"direct-to-indirect", poolId: p.id, msg:`"${p.name}" direct-charges an indirect department; it cannot be stepped down.` });
          }
        }
      } else {
        // For step-down, the relevant denom check is over receivers AFTER home.
        const home = depts.find(d => d.id === p.centerId);
        const homeIdx = stepOrder.findIndex(d => d.id === home?.id);
        const receivers = homeIdx >= 0
          ? [...stepOrder.slice(homeIdx + 1), ...directDepts]
          : directDepts;
        const total = receivers.reduce((a, r) => a + (s.drivers[r.id]?.[p.basis] || 0), 0);
        if (total <= 0) {
          warnings.push({ kind:"driver-empty", poolId: p.id, msg:`"${p.name}" uses ${p.basis} but no receiving department has a value for that driver.` });
        }
      }
      if (!p.amount || p.amount <= 0) {
        warnings.push({ kind:"zero-amount", poolId: p.id, msg:`"${p.name}" has $0 amount.` });
      }
      if (!p.explanation || p.explanation.trim().length < 10) {
        warnings.push({ kind:"explanation", poolId: p.id, msg:`"${p.name}" needs a written allocation rationale.` });
      }
    });
    if (Math.abs(unallocated) > 1) {
      warnings.push({ kind:"unallocated", msg:`$${Math.round(unallocated).toLocaleString()} not fully allocated to direct departments.` });
    }

    return {
      // raw state
      departments: depts, directDepts, indirectDepts,
      bases:       s.bases,
      centers:     s.centers,
      pools:       s.pools,
      drivers:     s.drivers,
      sources:     s.sources,

      // step-down detail (for trace / matrix view)
      alloc1, alloc2,
      stepOrder, stepEvents,
      method: "step-down",

      // final outputs
      allocRows, matrix, deptOH, byPool, byCenter,

      // totals + validation
      totals: { totalCAP, totalAllocated, unallocated },
      warnings,
    };
  }

  // ---------- React hook ----------
  function useCAPModel() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => store.subscribe(() => force()), []);
    return computeModel();
  }

  // ---------- Actions ----------
  const actions = {
    updateDriver(deptId, basisId, value) {
      const drivers = { ...store.state.drivers };
      drivers[deptId] = { ...(drivers[deptId] || {}), [basisId]: +value || 0 };
      store.update({ drivers });
    },
    updatePool(id, patch) {
      const pools = store.state.pools.map(p => p.id === id ? { ...p, ...patch } : p);
      store.update({ pools });
    },
    addPool(centerId) {
      const id = "P" + Date.now().toString(36).toUpperCase().slice(-5);
      store.update({ pools: [...store.state.pools, {
        id, centerId: centerId || store.state.centers[0]?.id,
        name:"New cost pool", amount: 0, basis:"FTE",
        explanation:"", _orig: 0,
      }]});
    },
    removePool(id) {
      store.update({ pools: store.state.pools.filter(p => p.id !== id) });
    },
    addCenter() {
      const id = "C" + Date.now().toString(36).toUpperCase().slice(-5);
      store.update({ centers: [...store.state.centers, { id, name:"New cost center", fy:"" }]});
    },
    updateCenter(id, patch) {
      const centers = store.state.centers.map(c => c.id === id ? { ...c, ...patch } : c);
      store.update({ centers });
    },
    removeCenter(id) {
      store.update({
        centers: store.state.centers.filter(c => c.id !== id),
        pools:   store.state.pools.filter(p => p.centerId !== id),
      });
    },

    // Step-order controls
    setStepOrder(deptId, newOrder) {
      const departments = store.state.departments.map(d =>
        d.id === deptId ? { ...d, stepOrder: +newOrder } : d
      );
      store.update({ departments });
    },
    moveStepUp(deptId) {
      const indirects = store.state.departments
        .filter(d => d.kind === "indirect")
        .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
      const idx = indirects.findIndex(d => d.id === deptId);
      if (idx <= 0) return;
      const a = indirects[idx], b = indirects[idx - 1];
      const departments = store.state.departments.map(d => {
        if (d.id === a.id) return { ...d, stepOrder: b.stepOrder };
        if (d.id === b.id) return { ...d, stepOrder: a.stepOrder };
        return d;
      });
      store.update({ departments });
    },
    moveStepDown(deptId) {
      const indirects = store.state.departments
        .filter(d => d.kind === "indirect")
        .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
      const idx = indirects.findIndex(d => d.id === deptId);
      if (idx < 0 || idx >= indirects.length - 1) return;
      const a = indirects[idx], b = indirects[idx + 1];
      const departments = store.state.departments.map(d => {
        if (d.id === a.id) return { ...d, stepOrder: b.stepOrder };
        if (d.id === b.id) return { ...d, stepOrder: a.stepOrder };
        return d;
      });
      store.update({ departments });
    },
  };

  // ---------- Legacy bridge ----------
  function loadedRateForDept(deptId) {
    const m = computeModel();
    const oh = m.deptOH[deptId];
    if (!oh) return null;
    const POSITIONS = (window.AFFERENT_EXT && window.AFFERENT_EXT.POSITIONS) || [];
    const inDept = POSITIONS.filter(p => p.dept === deptId);
    const directLabor = inDept.reduce((a, p) => a + p.fte * (p.salary + p.benefits), 0);
    const productiveHours = inDept.reduce((a, p) => a + p.fte * p.hours, 0);
    const directHourly = productiveHours > 0 ? directLabor / productiveHours : 0;
    const overheadPct = directLabor > 0 ? (oh.allocatedCAP / directLabor) * 100 : 0;
    const loadedHourly = directHourly * (1 + overheadPct / 100);
    return {
      directLabor, productiveHours, directHourly, loadedHourly, overheadPct,
      allocatedCAP: oh.allocatedCAP, recoverableCAP: oh.allocatedCAP,
    };
  }

  window.AFFERENT_CAP = {
    store, actions, useCAPModel, computeModel, loadedRateForDept,
  };
})();
