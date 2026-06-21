import "@phosphor-icons/react";

// Augmentation: @phosphor-icons/react@2.1.10's IconProps extends
// ComponentPropsWithoutRef<"svg"> but with @types/react@19 under pnpm's strict
// isolated node_modules the inherited className does not surface for JSX usage
// (TS2322). Backfill it via declaration merging.
declare module "@phosphor-icons/react" {
  interface IconProps {
    className?: string;
  }
}
