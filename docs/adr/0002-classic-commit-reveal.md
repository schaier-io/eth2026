# Classic Commit-Reveal For Voter Sovereignty

Status: accepted

Votes use classic commit-reveal. The operator must not be able to decrypt, inspect, or reveal votes for users because that would make the operator a privileged reveal service and weaken the claim that the protocol is not an oracle.

**Considered Options**

- Operator-encrypted votes: rejected because it improves demo convenience at the cost of voter sovereignty.
- Threshold encryption: deferred because it is the stronger long-term direction but too large for the hackathon scope.
- Classic commit-reveal: accepted because it is simple, defensible, and keeps voters in control of their own reveals.

