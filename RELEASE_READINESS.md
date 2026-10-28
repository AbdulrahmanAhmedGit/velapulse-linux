# Release readiness

2026-10-28 — application integration preview, not a general stability release.

| Area | Readiness | Evidence / release gate |
| --- | --- | --- |
| Stock GNOME 50 application | Working preview candidate | Actual stock Ubuntu VM login activates service; extension controls/reconnect pass; no patched Mutter dependency |
| Native layer-shell application | Working preview candidate in validated VM | Actual mapped GTK UI, handoff/failure cleanup, controls, outputs/125%/fullscreen/lock observations pass |
| Packaging | User installation/removal available | D-Bus/systemd ownership, desktop settings launcher, native-only option; VM uninstall/reinstall passed |
| Core activities | Implemented with targeted tests | Saved suspend-aware clocks, MPRIS capabilities/local artwork, bounded external API, optional battery/volume |
| Settings | Functional native GTK experience | Live configuration/widget regression passed; backend, placement, sizes, theme, opacity, motion, priorities, display and autostart |
| Real player ecosystem | Incomplete | Controlled MPRIS peers tested; independent Spotify/browser and multiple-real-player checks remain |
| Performance | Short idle baseline only | 15 s guest sample: daemon 6.22 MiB, GTK 171.87 MiB; CPU rounded to 0.0% for each; active/hardware/long-term profiling remains |
| Other GNOME versions | Unverified | Extension declares Shell 50 only |
| Accessibility / small displays | Incomplete | Semantic control names/focus and reduced-motion hooks exist; independent accessibility and narrow settings-window audit remains |
| Experimental Mutter deployment | **VM-only; workstation deployment blocked** | Existing validated candidate reused without compositor changes; prior physical GPU, power/wake and long-term gates remain |

The two repositories and licenses remain separate. No visibility change, host
compositor replacement, host Shell/GDM restart, host suspend/reboot or host user
service installation was performed. Application readiness does not waive any
experimental compositor deployment gate.

Use the development branch and reports to review the implementation. Before a
broad application release, exercise real players, profile active GTK memory/GPU
use, audit accessibility and run sustained daily-use sessions. Before considering
experimental Mutter on hardware, close the separately documented compositor
power/security/hardware gates in its private repository. Do not treat this report
as authorization to install that compositor on a workstation.
