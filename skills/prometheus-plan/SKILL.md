---
name: prometheus-plan
description: Prometheus interview planning. /plan then /start-work for boulder execution.
user_invocable: true
---

# Prometheus Plan

## Plan mode

```
/plan "migrate auth to OAuth"
```

or `/prometheus …`

While active, only writes under `.omg/plans/` are allowed.

## Execute

```
/start-work
```

Activates boulder continuation (Atlas-style execution) from the plan.
