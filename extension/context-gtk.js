import {SPACE, LAYOUT} from './layout.js';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import {createContextCard} from './context-cards.js';
export function createGtkContextCard(activity, onAction, compose) {
  const ui = {
    create(n, action) {
      switch (n.type) {
        case 'tabs': {
          const root = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
          root._tabsStack = new Gtk.Stack({vhomogeneous: false, hhomogeneous: false});
          root.append(
            new Gtk.StackSwitcher({
              stack: root._tabsStack,
              halign: Gtk.Align.FILL,
              hexpand: true,
              css_classes: ['vela-forecast-tabs'],
            }),
          );
          root.append(root._tabsStack);
          return root;
        }
        case 'text':
          return new Gtk.Label({
            xalign: 0,
            wrap: n.wrap,
            ellipsize: n.wrap ? 0 : 3,
            max_width_chars: n.wrap ? 34 : 28,
            hexpand: n.expand === true,
          });
        case 'icon':
          return new Gtk.Image({valign: Gtk.Align.CENTER, pixel_size: n.size});
        case 'button':
        case 'icon-button': {
          const b = new Gtk.Button({valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER});
          if (n.type === 'icon-button') {
            b._cardIcon = new Gtk.Image({icon_name: n.icon, pixel_size: n.size ?? 16});
            b.set_child(b._cardIcon);
          }
          b.connect('clicked', () => action(b._cardAction));
          return b;
        }
        case 'scroll': {
          const scroll = new Gtk.ScrolledWindow({
            focusable: true,
            overlay_scrolling: false,
            height_request: n.label ? LAYOUT.navigationViewport : LAYOUT.forecastViewport,
            min_content_height: n.label ? LAYOUT.navigationViewport : LAYOUT.forecastViewport,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.NEVER,
            propagate_natural_height: true,
            hexpand: true,
          });
          scroll.update_property([Gtk.AccessibleProperty.LABEL], [n.label ?? 'Hourly forecast']);
          const click = new Gtk.GestureClick({propagation_phase: Gtk.PropagationPhase.CAPTURE});
          click.connect('pressed', () => scroll.grab_focus());
          scroll.add_controller(click);
          const keys = new Gtk.EventControllerKey();
          keys.connect('key-pressed', (_, key) => {
            if (![Gdk.KEY_Left, Gdk.KEY_Right, Gdk.KEY_Home, Gdk.KEY_End].includes(key))
              return false;
            const a = scroll.get_hadjustment();
            a.value =
              key === Gdk.KEY_Home
                ? 0
                : key === Gdk.KEY_End
                  ? a.upper - a.page_size
                  : a.value + (key === Gdk.KEY_Right ? 72 : -72);
            return true;
          });
          scroll.add_controller(keys);
          return scroll;
        }
        case 'range': {
          const area = new Gtk.DrawingArea({
            width_request: 64,
            height_request: 6,
            valign: Gtk.Align.CENTER,
          });
          area.set_draw_func((_, cr, w, h) => {
            const v = area._range;
            cr.setSourceRGBA(0.6, 0.65, 0.75, 0.2);
            cr.rectangle(0, h / 2 - 2, w, 4);
            cr.fill();
            cr.setSourceRGBA(0.54, 0.76, 0.95, 1);
            cr.rectangle(w * v.start, h / 2 - 2, Math.max(4, w * (v.end - v.start)), 4);
            cr.fill();
          });
          return area;
        }
        default:
          return new Gtk.Box({
            halign: n.style === 'vela-transport' ? Gtk.Align.CENTER : Gtk.Align.FILL,
            orientation:
              n.type === 'column' ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
            spacing: n.gap ?? (n.style === 'vela-context-card' ? SPACE.md : SPACE.sm),
            hexpand: n.expand !== false,
          });
      }
    },
    update(w, n) {
      w._cardKey = n.key;
      w._cardLabel = n.label;
      if (w._contextStyle !== (n.style ?? '')) {
        w._contextStyle = n.style ?? '';
        w.set_css_classes(w._contextStyle.split(' ').filter(Boolean));
      }
      if ((n.type === 'text' || n.type === 'button') && w.label !== n.text) w.label = n.text;
      if (n.type === 'button' || n.type === 'icon-button') {
        w._cardAction = n.action;
        if (n.type === 'icon-button') w._cardIcon.icon_name = n.icon;
        w.tooltip_text = n.text;
        w.update_property([Gtk.AccessibleProperty.LABEL], [n.text]);
      }
      if (n.type === 'icon' && w.icon_name !== n.icon) w.icon_name = n.icon;
      if (n.type === 'range' && (w._range?.start !== n.start || w._range?.end !== n.end)) {
        w._range = n;
        w.queue_draw();
      }
    },
    children(w, children) {
      if (w._tabsStack) {
        for (const c of children)
          if (!c.get_parent()) w._tabsStack.add_titled(c, c._cardKey, c._cardLabel ?? c._cardKey);
        return;
      }
      if (w instanceof Gtk.ScrolledWindow) {
        if (w.get_child() !== children[0]) w.set_child(children[0]);
        return;
      }
      if (!(w instanceof Gtk.Box)) return;
      let previous = null;
      for (const c of children) {
        if (!c.get_parent()) w.append(c);
        w.reorder_child_after(c, previous);
        previous = c;
      }
    },
    remove(w, c) {
      if (w._tabsStack) {
        w._tabsStack.remove(c);
        return;
      }
      if (w instanceof Gtk.ScrolledWindow) w.set_child(null);
      else w.remove(c);
    },
  };
  return createContextCard(ui, activity, onAction, compose);
}
