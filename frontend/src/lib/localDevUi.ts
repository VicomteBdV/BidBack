import { isLocalDevEnvironment } from "@/lib/localDevEnvironment";

export function isLocalDevUiEnabled() {
  return isLocalDevEnvironment();
}
