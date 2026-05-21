/* DEPRECATED — superseded by lib/data/jurisdictions + lib/active.
 *
 * The CITY constant is left here only so any straggler imports still
 * resolve. New code must use one of:
 *   - useActiveJurisdiction() / useActiveFiscalYear()   (React)
 *   - getActiveJurisdiction() / getActiveFiscalYear()   (non-React)
 *
 * The value resolves against the registry's default jurisdiction so
 * existing render paths see the same Los Altos Hills demo content
 * during the refactor. Remove this file once nothing imports CITY. */

import type { City } from "../types";
import { getJurisdictionOrDefault, DEFAULT_JURISDICTION_ID } from "./jurisdictions";

const j = getJurisdictionOrDefault(DEFAULT_JURISDICTION_ID);

export const CITY: City = {
  name: j.name,
  fiscal: j.defaultFiscalYear,
  preparedBy: j.preparedBy,
  peers: j.peers,
};
