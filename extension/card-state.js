import {actionInfo, present} from './presentation.js';

// A card's identity is independent of unrelated activities and button state.
export function cardIdentity(activity) {
  return JSON.stringify([activity?.id ?? null, present(activity).type]);
}
export function navigationTree({activities, selected}) {
  return {
    key: 'navigation',
    type: 'scroll',
    label: 'Switch activity',
    style: 'vela-navigation-scroll',
    children: [
      {
        key: 'items',
        type: 'row',
        style: 'vela-activity-rail',
        children: activities.map((a) => ({
          key: a.id,
          type: 'icon-button',
          icon: present(a).icon,
          text: `Show ${a.title}`,
          action: a.id,
          style: `vela-icon-button ${a.id === selected ? 'vela-rail-selected' : 'vela-rail-item'}`,
        })),
      },
    ],
  };
}
export function controlsTree(activity) {
  const controls = [...(activity?.controls ?? [])].sort((a, b) =>
    a === 'reset' ? -1 : b === 'reset' ? 1 : 0,
  );
  // The playback slot survives pause/resume. Its current action is updated in
  // place, so keyboard focus and a held pointer never target a removed widget.
  return {
    key: 'transport',
    type: 'row',
    style: 'vela-transport',
    children: controls.map((action) => {
      const [icon, text] = actionInfo(action, activity.status);
      return {
        key: ['pause', 'resume'].includes(action) ? 'toggle' : action,
        type: 'icon-button',
        icon,
        text,
        action,
        size: 24,
        style: `vela-icon-button ${['pause', 'resume', 'PlayPause'].includes(action) ? 'vela-primary' : 'vela-secondary'}`,
      };
    }),
  };
}
