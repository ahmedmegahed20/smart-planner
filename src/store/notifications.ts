import { create } from 'zustand';
import type { NotificationItem } from '../shared/types';

interface State {
  unread: number;
  list: NotificationItem[];
  set: (list: NotificationItem[], unread?: number) => void;
}

export const useNotification = create<State>((set) => ({
  unread: 0,
  list: [],
  set: (list, unread) =>
    set({
      list,
      unread:
        unread != null
          ? unread
          : list.filter((n) => !n.read && !n.dismissedAt && !n.resolvedAt).length,
    }),
}));