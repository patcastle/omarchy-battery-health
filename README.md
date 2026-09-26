# Battery Health for Omarchy

The built-in Omarchy power widget, extended with a battery-health toggle that
uses the charging policy exposed by your laptop through UPower.

![The power panel showing battery health and power profile controls](assets/screenshot.png)

_Wallpaper by [Simon Høiberg](https://x.com/SimonHoiberg), featuring Switzerland, our home._

## What it does

- Shows battery level, capacity, charge cycles, charge rate, and remaining time.
- Switches between the power profiles available on the system.
- Lets you choose between preserving battery health (the laptop's firmware
  charge limit) and charging to 100%.
- Hides the battery-health control when the hardware does not support it.
- Shows the battery percentage in the bar when you right-click the battery icon.

UPower reports the charging policy supported by the laptop. This may be a fixed
limit, a start/end range, or a firmware-optimized charging mode.

## Panel close-up

![Battery health enabled with a 75-80% firmware charging policy](assets/panel.png)

## Installing it

```bash
omarchy plugin add https://github.com/patcastle/omarchy-battery-health --enable
```

The plugin declares itself as a clone of `omarchy.power`, so Omarchy replaces
the built-in power widget in place and keeps its bar position and settings. You
do not need to disable or move the original widget manually.

Click the battery icon and choose **Preserve** or **Full charge** in the
Battery health section. The control only appears when UPower reports
charge-threshold support. Preserve enables the charge limit your laptop's
firmware provides; the start/end percentages it uses (for example 75–80%) come
from the firmware and are reported by UPower, not chosen in the panel. UPower
does not expose a way to change those values, so the plugin does not either.

## Compatibility

Requires an Omarchy version with shell plugin support, plus `upower` and
`busctl`. Those are part of a normal Omarchy installation.

Actual support depends on the laptop firmware, kernel driver, and UPower. The
plugin uses UPower's D-Bus API and does not use `sudo` or `pkexec`.

If another tool already manages your charge threshold, use one or the other so
they do not fight over the setting.

## Removing it

```bash
omarchy plugin disable patcastle.power
omarchy plugin remove patcastle.power
```

Disabling or removing it restores the built-in `omarchy.power` widget.

## Development

```bash
omarchy plugin validate .
./test.sh
```

This is a clone of Omarchy's power widget while the corresponding upstream
change is under review in [basecamp/omarchy#8579](https://github.com/basecamp/omarchy/pull/8579).

## License

MIT
