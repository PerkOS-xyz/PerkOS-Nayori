import LandingMotionController from "../components/LandingMotionController";
import MotionProvider from "../components/landing/MotionProvider";
import Hero from "../components/landing/Hero";
import LiveTicker from "../components/landing/LiveTicker";
import Primitives from "../components/landing/Primitives";
import ModelsDeck from "../components/landing/ModelsDeck";
import Enforcement from "../components/landing/Enforcement";
import BoundaryLedger from "../components/landing/BoundaryLedger";
import Quickstart from "../components/landing/Quickstart";
import FinalCta from "../components/landing/FinalCta";

export default function Home() {
  return (
    <MotionProvider>
      <div className="relative">
        <LandingMotionController />

        <Hero />

        {/* Everything below scrolls up over the pinned hero, so it must be opaque.
            The seam fades in instead of cutting, so the art bleeds into the page. */}
        <div className="relative z-10">
          <div
            aria-hidden="true"
            className="h-f6 bg-gradient-to-b from-transparent via-ink-950/70 to-ink-950"
          />
          <div className="bg-ink-950">
            <LiveTicker />
            <Primitives />
            <ModelsDeck />
            <Enforcement />
            <BoundaryLedger />
            <Quickstart />
            <FinalCta />
          </div>
        </div>
      </div>
    </MotionProvider>
  );
}
