import { ReactNode } from "react";

type Props = {
  title: string;
  center?: boolean;
  children?: ReactNode;
};

const SpotlightHero = ({ title, center = false, children }: Props) => (
  <section
    className={`hero-dark relative flex w-full flex-col overflow-hidden ${
      center ? "min-h-[100dvh] justify-center" : ""
    }`}
  >
    {/* Background is the global video layer — no per-page washes. */}


    {!center && <div className="pt-safe" />}


    <div className="relative z-40 flex w-full flex-col">{children}</div>
  </section>
);

export default SpotlightHero;
