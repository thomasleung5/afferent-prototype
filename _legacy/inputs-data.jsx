// Inputs data — derives from window.AFFERENT_DATA.SERVICES so Inputs and Dashboard share a single source of truth.

(function(){
  const DATA = window.AFFERENT_DATA;
  const SERVICES = DATA.SERVICES;
  const DEPTS = DATA.DEPTS;

  // Departments mirror data.jsx
  const departments = [
    { id:"PLAN", name:"Planning Administration",     division:"Development Services" },
    { id:"BLDG", name:"Building Administration",     division:"Development Services" },
    { id:"ENG",  name:"Engineering Administration",  division:"Public Works" },
  ];

  // Staffing — same roles that appear in staffMix() in data.jsx, with plausible FTE/salary
  const staffing = [
    // Planning
    { id:"s-pln-1", dept:"PLAN", division:"Current Planning",      role:"Planning Director",              fte: 0.35, salary: 312000, notes:"Includes CEQA oversight" },
    { id:"s-pln-2", dept:"PLAN", division:"Current Planning",      role:"Senior Planner",                  fte: 1.00, salary: 214000, notes:"" },
    { id:"s-pln-3", dept:"PLAN", division:"Current Planning",      role:"Associate Planner",               fte: 1.00, salary: 178000, notes:"" },
    { id:"s-pln-4", dept:"PLAN", division:"General Counter",       role:"Administrative Support",          fte: 0.40, salary: 124000, notes:"40% allocated to fees" },

    // Building
    { id:"s-bld-1", dept:"BLDG", division:"Plan Check/Permitting", role:"Building Official",               fte: 0.75, salary: 286000, notes:"" },
    { id:"s-bld-2", dept:"BLDG", division:"Plan Check/Permitting", role:"Plans Examiner / Plan Check",     fte: 1.00, salary: 238000, notes:"Contract + in-house" },
    { id:"s-bld-3", dept:"BLDG", division:"Plan Check/Permitting", role:"Building Inspector",              fte: 1.00, salary: 198000, notes:"Field + plan review" },
    { id:"s-bld-4", dept:"BLDG", division:"General Counter",       role:"Permit Technician",               fte: 1.00, salary: 132000, notes:"" },

    // Engineering
    { id:"s-eng-1", dept:"ENG",  division:"Development Review",    role:"Public Works Director / City Engineer", fte: 0.30, salary: 298000, notes:"" },
    { id:"s-eng-2", dept:"ENG",  division:"Development Review",    role:"Senior / Associate Engineer",     fte: 1.00, salary: 204000, notes:"" },
    { id:"s-eng-3", dept:"ENG",  division:"Development Review",    role:"Public Works Inspector",          fte: 0.60, salary: 168000, notes:"Encroachment + grading" },
  ];

  // Cost pools — same as before
  const costPools = [
    { id:"cp1", name:"Town Manager's Office",  cost: 612000, method:"labor" },
    { id:"cp2", name:"Finance & Accounting",   cost: 548000, method:"labor" },
    { id:"cp3", name:"Human Resources",        cost: 284000, method:"fte" },
    { id:"cp4", name:"Information Technology", cost: 396000, method:"fte" },
    { id:"cp5", name:"City Attorney",          cost: 218000, method:"custom" },
    { id:"cp6", name:"Facilities & Insurance", cost: 342000, method:"fixed" },
  ];
  const customAllocations = { cp5: { PLAN: 45, BLDG: 20, ENG: 35 } };
  const fixedAllocations  = { cp6: { PLAN: 33, BLDG: 34, ENG: 33 } };

  // Services — derive directly from Dashboard SERVICES.
  // Classify type from id/name; default to "permit".
  function classify(s) {
    const n = s.name.toLowerCase();
    if (n.includes("inspection") || n.includes("occupancy")) return "inspection";
    if (n.includes("review") || n.includes("hearing") || n.includes("cup") || n.includes("variance") ||
        n.includes("application") || n.includes("analysis") || n.includes("meeting") || n.includes("modification"))
      return "application";
    if (n.includes("permit") || n.includes("rate") || n.includes("fee")) return "permit";
    return "other";
  }

  const services = SERVICES.map(s => ({
    id: s.id,
    name: s.name,
    dept: s.dept,
    type: classify(s),
    volume: s.volume,
    hours: s.hours,
    fee: s.fee,
    // carry cost through for convenience (Inputs pages recompute from hours × rate, which matches within rounding)
    cost: s.cost,
  }));

  // Role mix — derive from data.jsx staffMix() which gives { role, rate, hrs } per service
  const roleMix = {};
  SERVICES.forEach(s => {
    const mix = DATA.staffMix(s);
    const totalHrs = mix.reduce((a,m) => a + m.hrs, 0);
    const out = {};
    mix.forEach(m => {
      const pct = totalHrs > 0 ? Math.round((m.hrs / totalHrs) * 100) : 0;
      if (pct > 0) out[m.role] = (out[m.role] || 0) + pct;
    });
    // Fix rounding to 100
    const sum = Object.values(out).reduce((a,b) => a+b, 0);
    if (sum !== 100 && sum > 0) {
      const first = Object.keys(out)[0];
      out[first] += (100 - sum);
    }
    roleMix[s.id] = out;
  });

  // Fee policies — carry over `target` from SERVICES (NBS recommendation is 100%, solar is 80%)
  const feePolicies = SERVICES.map(s => ({
    id: s.id,
    target: s.target ?? 100,
    subsidy: (s.target ?? 100) < 100,
    notes: s.id === "bldg-solar" ? "Capped per CA Gov Code § 66015" :
           s.id === "eng-bldg" || s.id === "eng-adu" || s.id === "eng-minor" || s.id === "eng-major" ? "Currently embedded in building permit — unbundle"
         : "",
  }));

  const policyDefaults = { defaultTarget: 100, rounding: 10 };

  window.AFFERENT_INPUTS = {
    departments, staffing, costPools, customAllocations, fixedAllocations,
    services, roleMix, feePolicies, policyDefaults,
  };
})();
