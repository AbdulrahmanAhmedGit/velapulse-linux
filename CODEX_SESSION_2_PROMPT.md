# Mission: native layer-shell support for GNOME Mutter

Act as a compositor engineer and project maintainer. Build and test native `zwlr_layer_shell_v1` support for GNOME Mutter in a separate `mutter-layer-shell` repository. Continue through implementation and validation; do not stop at a design proposal. Keep the user's installed Mutter and active desktop untouched unless explicit approval is obtained for a concrete installation plan.

## Verified context from the VelaPulse session

The host inspected on 2026-10-26 runs Ubuntu 26.04.1 LTS, x86_64, Linux 7.0.0-38-generic, GNOME Shell 50.1, Mutter package 50.1-0ubuntu2.4 and GJS 1.88.0 in a Wayland session. Reinspect before assuming these versions remain current.

The live Mutter registry did NOT advertise `zwlr_layer_shell_v1`. It did advertise wl_compositor, wl_shm, wl_output, wl_seat, xdg_wm_base, wp_viewporter and wp_fractional_scale_manager_v1. No compositor source was patched. An isolated Sway 1.11/wlroots 0.19.2 test advertised layer-shell version 4.

VelaPulse is independently implemented at https://github.com/AbdulrahmanAhmedGit/velapulse-linux. Clone that repository or locate its existing checkout and assign its absolute path to VELAPULSE_ROOT. Read its AGENTS.md and docs/{ARCHITECTURE,API,ENVIRONMENT,TESTING,SECOND_SESSION_HANDOFF}.md. Do not assume it is the current working directory. Its MIT code does not include Now Bar implementation or assets.

VelaPulse has a Rust 1.99.1 core, a GNOME 50 St/Clutter extension, and a separate GJS/GTK4 renderer using gtk4-layer-shell 1.3.0. The GNOME extension works independently of your project. The live user service was installed with approval, but newly installed extension discovery required logout/login. Do not disrupt that service or its settings during isolated tests.

## Required investigation and legal strategy

Inspect current Mutter source architecture, release tags, distribution patches, build dependencies, renderer and Wayland object lifecycles. Establish the exact supported base and record commit IDs. Review authoritative Wayland/wlr protocol XML and version requirements, plus existing implementation approaches and their licenses. Do not copy incompatible code or assume that a new repository name removes attribution obligations.

Choose an independent patch repository or a properly attributed Mutter fork as licensing permits. Preserve upstream copyright and license notices, use the configured Git identity, and clearly distinguish your changes. Do not claim Mutter-derived code is solely MIT. Document source and protocol provenance before implementation.

## Implement and validate

Implement compositor-side protocol globals, layer surfaces and lifecycle handling, configure/ack_configure sequencing, buffer mapping/unmapping, output assignment and removal, layer stacking, anchors, margins, requested sizes, exclusive zones, keyboard interactivity, pointer/touch input, popups, scaling and multiple monitors. Handle malformed requests, invalid states, client disconnect, fullscreen and lockscreen behavior safely. Advertise only versions and semantics actually implemented.

Create meaningful protocol tests and integration tests, including invalid requests and resource cleanup. Use a separate prefix/build tree, private D-Bus session, separate XDG configuration/data directories and isolated nested or headless compositor. Do not replace system Mutter, restart the user's active GNOME session, weaken protections, or enable unsafe Shell evaluation in the live desktop. Test virtual monitors and outputs, then clearly mark physical hardware tests that remain unperformed.

## VelaPulse integration contract

Run `cargo build --release --locked` in VELAPULSE_ROOT. `target/release/velapulse capabilities` inspects the live registry and reports layer_shell plus a backend recommendation. It does not infer support from the desktop name or automatically install a backend.

On your isolated bus, start `target/release/velapulse daemon`, then `scripts/run-layer-shell.sh` with the isolated WAYLAND_DISPLAY. Its surface namespace is `velapulse`, layer TOP, exclusive zone 0, horizontally centered with top/bottom anchors and margins. Keyboard mode is NONE compact and ON_DEMAND expanded. Monitor selection falls back when an output disappears. Do not run the GNOME renderer simultaneously unless testing duplicate surfaces intentionally.

The launcher sets GDK_BACKEND=wayland and preloads libgtk4-layer-shell.so.0. This is essential: without preloading, the first session observed an ordinary xdg toplevel instead of a layer surface. Confirm the compositor receives real layer-shell requests.

The design refinement also includes shared presentation rules, original fallback artwork and native libadwaita preferences. Media snapshots expose source, position_seconds and duration_seconds; none of this changes the compositor contract.

The core owns session bus name `io.github.velapulse.Service`, object `/io/github/velapulse/Service`, interface `io.github.velapulse.Service1`. Snapshot returns JSON `{version:1,activities,config}`; Changed broadcasts snapshots. Command accepts `(id:string, action:string, seconds:uint64)`. Start a timer with `velapulse timer start 300` and verify live UI updates, expand/collapse, controls and positioning. The compositor implementation should require no core API changes.

A gated virtual-pointer fixture exists at `tests/fixtures/wayland_pointer.rs`; build with `cargo build --example test-pointer`. Use it only with VELAPULSE_ISOLATED_TEST=1 and an isolated display. Alternatively write a minimal conformance client. Existing tests established Sway rendering and timer-button input, not complete protocol conformance.

## Known limits and final deliverables

VelaPulse still needs full fullscreen/lockscreen, keyboard accessibility, fractional-scale and physical-hotplug testing. Its timers exclude suspend and do not survive daemon restart; audio uses a 15-second wpctl fallback; remote artwork is not fetched. Distinguish these application limits from compositor defects.

Deliver working source, meaningful commits, build instructions, compatibility matrix, actual test results, protocol support matrix, limitations, resource measurements where available, and VelaPulse integration evidence. Provide a reviewed installation and rollback procedure that requires explicit user approval before changing system components. Keep the isolated build usable without installation. If blocked, document the precise evidence and continue all independent safe work. Never fabricate test results or declare scaffolding complete.
