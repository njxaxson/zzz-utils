# Totalize

**Shape:** carry + **double stunner**. Hugo is the prominent example.

## Why two stunners beats a good support

Hugo converts accumulated stun *time* into damage. A second stunner — even a low-tier one —
produces more stun time than a strong support produces damage amplification. So the usual
"never run two stunners" instinct is wrong here, and the engine should be reporting double-
stunner lines at the top for this carry.

For units with low totalize weights, such as Pyrois (totalize weight 1), a second stunner is not 

always necessary and a support may be prefered instead, depending on the emergent value of the mechanics. 

## Field time

Hugo is `onfield: false`. He enters for chains and totalize bursts, then hands field time
back to the rest of the team. That matters for how the engine budgets who is actually on
screen; see [L4 components](../engine/l4-components.md).

## Naming

The file is named for the mechanic, not the unit. A future carry with the same stun-time
conversion belongs on this page.