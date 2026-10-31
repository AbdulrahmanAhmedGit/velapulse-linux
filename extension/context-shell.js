import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {createContextCard} from './context-cards.js';
export function createShellContextCard(activity, onAction, compose) {
  const ui = {
    create(n, action) {
      switch (n.type) {
        case 'tabs': {
          const root = new St.BoxLayout({vertical: true, x_expand: true});
          root._tabsBar = new St.BoxLayout({style_class: 'vela-forecast-tabs'});
          root._tabsBody = new St.BoxLayout({vertical: true, x_expand: true});
          root._tabsKey = null;
          root.add_child(root._tabsBar);
          root.add_child(root._tabsBody);
          return root;
        }
        case 'text': {
          const label = new St.Label({
            x_expand: n.expand === true,
            y_align: Clutter.ActorAlign.CENTER,
          });
          label.clutter_text.line_wrap = n.wrap;
          label.clutter_text.ellipsize = n.wrap ? 0 : 3;
          return label;
        }
        case 'icon':
          return new St.Icon({icon_size: n.size, y_align: Clutter.ActorAlign.CENTER});
        case 'button':
        case 'icon-button': {
          const b = new St.Button({
            can_focus: true,
            x_expand: n.type === 'button',
            y_align: Clutter.ActorAlign.CENTER,
          });
          if (n.type === 'icon-button')
            b.set_child(new St.Icon({icon_name: n.icon, icon_size: n.size ?? 16}));
          b.connect('clicked', () => action(b._cardAction));
          return b;
        }
        case 'scroll': {
          const s = new St.ScrollView({
            x_expand: true,
            reactive: true,
            can_focus: true,
            accessible_name: n.label ?? 'Hourly forecast',
          });
          s.set_policy(St.PolicyType.AUTOMATIC, St.PolicyType.NEVER);
          s.connect('button-press-event', () => {
            s.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
          });
          s.connect('key-press-event', (_, event) => {
            const key = event.get_key_symbol();
            if (
              ![Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Home, Clutter.KEY_End].includes(
                key,
              )
            )
              return Clutter.EVENT_PROPAGATE;
            const a = s.hadjustment;
            a.value =
              key === Clutter.KEY_Home
                ? 0
                : key === Clutter.KEY_End
                  ? a.upper - a.page_size
                  : a.value + (key === Clutter.KEY_Right ? 72 : -72);
            return Clutter.EVENT_STOP;
          });
          return s;
        }
        case 'range': {
          const area = new St.DrawingArea({
            width: 64,
            height: 6,
            y_align: Clutter.ActorAlign.CENTER,
          });
          area.connect('repaint', () => {
            const cr = area.get_context(),
              [w, h] = area.get_surface_size(),
              v = area._range;
            cr.setSourceRGBA(0.6, 0.65, 0.75, 0.2);
            cr.rectangle(0, h / 2 - 2, w, 4);
            cr.fill();
            cr.setSourceRGBA(0.54, 0.76, 0.95, 1);
            cr.rectangle(w * v.start, h / 2 - 2, Math.max(4, w * (v.end - v.start)), 4);
            cr.fill();
            cr.$dispose();
          });
          return area;
        }
        default:
          return new St.BoxLayout({
            x_align:
              n.style === 'vela-transport' ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
            vertical: n.type === 'column',
            x_expand: n.expand !== false,
          });
      }
    },
    update(w, n) {
      w._cardKey = n.key;
      w._cardLabel = n.label;
      if (w._contextStyle !== (n.style ?? '')) {
        w._contextStyle = n.style ?? '';
        w.set_style_class_name(w._contextStyle);
      }
      if (n.type === 'text' && w.text !== n.text) w.text = n.text;
      if (n.type === 'button' && w.label !== n.text) {
        w.label = n.text;
        w.accessible_name = n.text;
      }
      if (n.type === 'button' || n.type === 'icon-button') {
        w._cardAction = n.action;
        w.accessible_name = n.text;
        if (n.type === 'icon-button') w.get_child().icon_name = n.icon;
      }
      if (n.type === 'icon' && w.icon_name !== n.icon) w.icon_name = n.icon;
      if (n.type === 'range' && (w._range?.start !== n.start || w._range?.end !== n.end)) {
        w._range = n;
        w.queue_repaint();
      }
    },
    children(w, children) {
      if (w._tabsBody) {
        const key = children.map((c) => c._cardKey).join('|');
        if (key !== w._tabsChildren) {
          w._tabsChildren = key;
          w._tabsBar.destroy_all_children();
          w._tabsButtons = children.map((c) => {
            const b = new St.Button({
              label: c._cardLabel ?? c._cardKey,
              can_focus: true,
              x_expand: true,
              style_class: 'vela-forecast-tab',
            });
            b.connect('clicked', () => {
              w._tabsKey = c._cardKey;
              select();
            });
            w._tabsBar.add_child(b);
            return b;
          });
        }
        for (const c of children) if (!c.get_parent()) w._tabsBody.add_child(c);
        if (!children.some((c) => c._cardKey === w._tabsKey)) w._tabsKey = children[0]?._cardKey;
        function select() {
          children.forEach((c, i) => {
            c.visible = c._cardKey === w._tabsKey;
            const style = 'vela-forecast-tab' + (c.visible ? ' vela-tab-selected' : '');
            if (w._tabsButtons[i].get_style_class_name() !== style)
              w._tabsButtons[i].set_style_class_name(style);
          });
        }
        select();
        return;
      }
      if (w instanceof St.ScrollView) {
        if (w.get_child() !== children[0]) w.set_child(children[0]);
        return;
      }
      if (!(w instanceof St.BoxLayout)) return;
      for (const [i, c] of children.entries()) {
        if (!c.get_parent()) w.add_child(c);
        if (w.get_child_at_index(i) !== c) w.set_child_at_index(c, i);
      }
    },
    remove(w, c) {
      if (w._tabsBody) {
        w._tabsBody.remove_child(c);
        c.destroy();
        return;
      }
      if (w instanceof St.ScrollView) w.set_child(null);
      else w.remove_child(c);
      c.destroy();
    },
  };
  return createContextCard(ui, activity, onAction, compose);
}
