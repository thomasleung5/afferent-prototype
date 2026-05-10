// screens-revenue-gap.jsx — Revenue Gap (executive summary, top-level)
//
// Answers: "What revenue is the city leaving on the table by under-collecting fees?"
// Pattern: Same answer-first flow as every decision screen.
//   1. AnswerHeader — gap, recovery%, uplift, services
//   2. FlagStrip    — the data-quality + policy flags affecting the answer
//   3. DriverBreakdown + DeptRecoveryChart — what's pulling the answer
//   4. TopFixes     — directly-actionable list ranked by uplift
//   5. AuditTrace   — single chain from inputs → answer (clickable)
//   6. Confidence band — completeness vs policy

const { useState: uS_RG, useMemo: uM_RG } = React;

function RevenueGapScreen() {
  const ENG = window.AFFERENT_ENGINE;
  const model = ENG.useModel();
  const capModel = window.AFFERENT_CAP ? window.AFFERENT_CAP.useCAPModel() : null;
  const t = model.totals;

  const annualGap = Math.max(0, t.totalCost - t.currentRev);
  const fullGap   = Math.max(0, t.fullRev    - t.currentRev);
  const recoveryPct = t.totalCost > 0 ? (t.currentRev / t.totalCost) * 100 : 0;

  const positions = ENG.store.state.positions;
  const services = model.services;
  const missingVolume = services.filter(s => !s.volume || s.volume === 0).length;
  const missingHours  = services.filter(s => !s.hours || s.hours === 0).length;
  const totalServices = services.length;
  const dataCompleteness = Math.round((1 - (missingVolume + missingHours) / Math.max(1, totalServices * 2)) * 100);

  const flags = window.computeFlags("overview", model, capModel);

  // Cost driver totals — sum across departments for stacked breakdown.
  const driverTotals = uM_RG(() => {
    const fbhr = model.fbhr || {};
    let direct = 0, operating = 0, cap = 0;
    Object.values(fbhr).forEach(f => {
      direct    += (f.direct    || f.salary || 0);
      operating += (f.operating || 0);
      cap       += (f.indirect  || f.cap || 0);
    });
    // Fallback: if fbhr doesn't carry these, derive from positions + CAP.
    if (direct === 0 && positions.length) {
      direct = positions.reduce((a, p) => a + p.fte * (p.salary + p.benefits), 0);
    }
    return { direct, operating, cap };
  }, [model, positions]);

  // Enrich services with `recommended` so TopFixes can rank by uplift.
  const enrichedServices = uM_RG(() => services.map(s => {
    const recommended = s.adopted || Math.round((s.cost || 0) * (s.target || 100) / 100 / 5) * 5;
    const volume = s.volume || 0;
    const cost = s.cost || 0;
    const recoveryNow = cost > 0 ? ((s.fee || 0) / cost) * 100 : 0;
    const confidence =
      (volume === 0 || (s.hours || 0) === 0) ? "low" :
      (recoveryNow > 200 || (s.hours || 0) < 0.1) ? "low" :
      (volume < 5 || cost < 50) ? "med" : "high";
    return { ...s, recommended, confidence };
  }), [services]);

  const topFixes = enrichedServices
    .map(s => ({ ...s, annualUplift: ((s.recommended || 0) - (s.fee || 0)) * (s.volume || 0) }))
    .filter(s => s.annualUplift > 0)
    .sort((a, b) => b.annualUplift - a.annualUplift)
    .slice(0, 6);
  const topFixesTotal = topFixes.reduce((a, s) => a + s.annualUplift, 0);

  return (
    <div className="page">

      {/* ANSWER */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
        <AnswerHeader
          question="What revenue is the city leaving on the table?"
          answer={fmt.dollarsK(annualGap) + "/yr"}
          tone="neg"
          sub="Cost of fee-supported services minus revenue collected. Closing it takes policy decisions, not just rate updates."
          stats={[
            { label: "Recovery rate", value: `${recoveryPct.toFixed(0)}%`, tone: recoveryPct < 60 ? "neg" : recoveryPct < 80 ? "warn" : "pos", sub: `${fmt.dollarsK(t.currentRev)} of ${fmt.dollarsK(t.totalCost)}` },
            { label: "Uplift at policy", value: fmt.dollarsK(fullGap) + "/yr", tone: "pos", sub: "if Council adopts targets" },
            { label: "Data complete", value: `${dataCompleteness}%`, tone: dataCompleteness >= 90 ? "pos" : dataCompleteness >= 75 ? "warn" : "neg", sub: `${missingVolume + missingHours} cells missing` },
          ]}
          actions={<>
            <Btn kind="ghost"><Icon name="download" size={13}/> Export brief</Btn>
            <Btn kind="primary" onClick={() => window.AFFERENT_NAV && window.AFFERENT_NAV("build-feestudy")}>Open fee schedule <Icon name="arrow-right" size={13}/></Btn>
          </>}
        />

      </div>

      {/* DRIVERS + DEPT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
          <SectionLabel>Where the gap comes from</SectionLabel>
          <DriverBreakdown direct={driverTotals.direct} operating={driverTotals.operating} cap={driverTotals.cap}/>
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
          <SectionLabel>Recovery by department</SectionLabel>
          <DeptRecoveryChart byDept={model.byDept} onNav={() => window.AFFERENT_NAV && window.AFFERENT_NAV("build-costs")}/>
        </div>
      </div>

      {/* TOP FIXES */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <SectionLabel>Fees with the largest cost-recovery shortfall</SectionLabel>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            <b className="num" style={{ color: "var(--pos)" }}>{fmt.dollarsK(topFixesTotal)}/yr</b> of the {fmt.dollarsK(fullGap)} gap.
          </div>
        </div>
        <TopFixes services={topFixes} max={6} onPick={() => window.AFFERENT_NAV && window.AFFERENT_NAV("build-feestudy")}/>
      </div>
    </div>
  );
}

function ConfidenceCell({ label, score, note }) {
  const color = score === "high" ? "var(--pos)" : score === "med" ? "var(--warn)" : "var(--neg)";
  const icon = score === "high" ? "●●●" : score === "med" ? "●●○" : "●○○";
  return (
    <div style={{ background: "var(--paper)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="mono" style={{ fontSize: 12, letterSpacing: "0.1em", color }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize", color }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

window.RevenueGapScreen = RevenueGapScreen;
