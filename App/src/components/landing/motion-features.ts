// Loaded asynchronously by LazyMotion so the animation feature set never lands
// in the landing's first chunk. domAnimation covers what this page uses
// (transforms, opacity, scroll-linked values); it excludes layout projection
// and drag, which the landing does not need.
export { domAnimation as default } from "motion/react";
