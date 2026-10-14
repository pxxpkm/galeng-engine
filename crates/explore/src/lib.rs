//! Headless Explore state machine for Plane (M1).
//!
//! No SDL — pure logic for hit-test, verb/item dispatch, Fallback, Call/Return, and save frames.

pub mod engine;
pub mod hit;
pub mod save;

pub use engine::{Engine, Error, Phase, StackFrame, TraceLayer, View, BUILTIN_FALLBACK};
pub use save::ExploreSave;
