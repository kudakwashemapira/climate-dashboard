/**
 * Wording that follows the type of the station (FR-003): the screens are the same for every station,
 * but they are named for what that station measures. A hydrological station reads "Hydrological
 * readings" where a meteorological one reads "Weather observations".
 *
 * The type comes with the sign-in (user.station.station_type). A national account has no station,
 * so the national app uses the general wording.
 */
import { useSession } from "../services/session";

export interface Terms {
  /** The record list: page title and menu entry. */
  observations: string;
  /** One record, in buttons and messages. */
  observation: string;
  /** The upload screen: page title and menu entry. */
  upload: string;
  /** What the readings are, in a sentence. */
  readings: string;
}

const GENERAL: Terms = { observations: "Weather observations", observation: "observation", upload: "Upload observations", readings: "weather readings" };

const BY_STATION_TYPE: Record<string, Terms> = {
  Meteorological: GENERAL,
  Hydrological: { observations: "Hydrological readings", observation: "reading", upload: "Upload readings", readings: "rainfall and other hydrological readings" },
  Combined: { observations: "Weather and hydrological readings", observation: "reading", upload: "Upload readings", readings: "weather and hydrological readings" },
  "Climate reference": { observations: "Climate reference observations", observation: "observation", upload: "Upload observations", readings: "climate reference readings" },
};

export function termsFor(stationType: string | null | undefined): Terms {
  return (stationType && BY_STATION_TYPE[stationType]) || GENERAL;
}

/** The wording for the signed-in account's station. */
export function useTerms(): Terms {
  return termsFor(useSession()?.user.station?.station_type);
}
