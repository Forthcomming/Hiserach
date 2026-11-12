import FigmaConnectedApp from "./figma-connected";
import { serverEnv } from "@/lib/env";

export default function Home() {
  return <FigmaConnectedApp fixtureMode={serverEnv.dataBackend === "memory"} />;
}
