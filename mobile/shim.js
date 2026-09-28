/**
 * SMART Planner — mobile runtime shim.
 *
 * Provides the same `window.ahmedAPI` surface the renderer expects, backed by
 * plain JavaScript + IndexedDB, so the existing React app runs unchanged inside
 * a Capacitor webview on Android / iOS (no Electron, no better-sqlite3).
 *
 * Task alarms are scheduled with the Capacitor Local Notifications plugin
 * (manifest-diff scheduling -> no duplicates across restarts). In-app
 * notifications (the bell) are stored as IndexedDB rows mirroring the desktop
 * `notification_item` table.
 *
 * Loaded ONLY into the mobile dist build; on desktop the preload exposes the
 * real Electron API first and this file refuses to overwrite it.
 */
(function (global) {
  'use strict';

  if (!global) return;
  // Desktop preload already installed the real API — never shadow it.
  if (global.ahmedAPI && typeof global.ahmedAPI.invoke === 'function') return;

  // =====================================================================
  // small helpers
  // =====================================================================
  var PAD = function (n) { return String(n).padStart(2, '0'); };
  var nowIso = function () { return new Date().toISOString(); };
  var uid = function (prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); };
  var toDateStr = function (d) { return d.getFullYear() + '-' + PAD(d.getMonth() + 1) + '-' + PAD(d.getDate()); };
  var todayStr = function () { return toDateStr(new Date()); };
  // Calendar day of a stored value, in the user's LOCAL timezone.
  //
  // Everything the app writes as a timestamp (createdAt/updatedAt/completedAt/
  // startedAt/endedAt/...) goes through nowIso(), which is UTC. Slicing those
  // with .slice(0, 10) yields the UTC day, which is a different calendar day
  // from the local one for every instant in the evening or early morning
  // outside UTC. That silently moved focus minutes and "completed today"
  // counts onto the neighbouring day. Convert through Date so bucketing agrees
  // with todayStr().
  //
  // Values that are already date-only ("YYYY-MM-DD") are local by construction,
  // so they are returned untouched.
  var dayOf = function (v) {
    if (v == null) return '';
    var s = String(v);
    if (s.length <= 10) return s;
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : toDateStr(d);
  };
  var parseDate = function (s) { var p = String(s || '').split('-').map(Number); return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1); };
  var addDays = function (iso, days) { var d = parseDate(iso); d.setDate(d.getDate() + days); return toDateStr(d); };
  var addMonths = function (iso, months) { var p = String(iso).split('-').map(Number); var nd = new Date(p[0], p[1] - 1 + months, p[2]); return toDateStr(nd); };
  var timeToMinutes = function (t) { if (!t) return 0; var p = String(t).split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
  var clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  var merge = function (a, b) { var o = {}; for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; if (b) for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; return o; };

  function parseTime(s) {
    var t = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحا|مساء)?/);
    if (!t) return null;
    var h = parseInt(t[1], 10);
    var mm = t[2] ? parseInt(t[2], 10) : 0;
    var ap = t[3] ? t[3].toLowerCase() : null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || mm > 59) return null;
    return PAD(h) + ':' + PAD(mm);
  }

  function parseNaturalDate(input) {
    var s = String(input || '').toLowerCase().trim();
    var today = todayStr();
    if (!s) return null;
    if (s === 'today') return today;
    if (s === 'tomorrow' || s === 'tmrw') return addDays(today, 1);
    if (s === 'yesterday') return addDays(today, -1);
    if (s === 'next week') return addDays(today, 7);
    var inX = s.match(/^in\s+(\d+)\s+days?$/);
    if (inX) return addDays(today, parseInt(inX[1], 10));
    var dayMap = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
    var dm = s.match(/(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|thurs|fri|sat)/);
    if (dm) {
      var day = dayMap[dm[2]];
      var d = parseDate(today);
      var diff = (day - d.getDay() + 7) % 7;
      if (dm[1]) diff = diff === 0 ? 7 : diff;
      if (diff === 0 && !dm[1]) return today;
      d.setDate(d.getDate() + diff);
      return toDateStr(d);
    }
    return null;
  }

  function parsePriority(s) {
    var t = String(s || '').toLowerCase();
    if (/(^|\s)p1(\s|$)/.test(t) || /urgent/.test(t)) return 'p1';
    if (/(^|\s)p2(\s|$)/.test(t) || /important/.test(t)) return 'p2';
    if (/(^|\s)p3(\s|$)/.test(t) || /normal/.test(t)) return 'p3';
    if (/(^|\s)p4(\s|$)/.test(t) || /low/.test(t)) return 'p4';
    return null;
  }

  function parseTags(s) {
    var out = [];
    var re = /#([a-zA-Z0-9_\-]+)/g;
    var m;
    while ((m = re.exec(String(s || ''))) !== null) out.push(m[1]);
    return out;
  }

  function parseDuration(s) {
    var mins = String(s || '').match(/(\d+)\s*(?:min|minutes?|m)(?:\s|$)/i);
    if (mins) return parseInt(mins[1], 10);
    var hrs = String(s || '').match(/(\d+)\s*(?:hr|hour|hours?|h)(?:\s|$)/i);
    if (hrs) return parseInt(hrs[1], 10) * 60;
    return null;
  }

  // deterministic signed 32-bit id for OS scheduled notifications
  function notifId(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return h;
  }

  // =====================================================================
  // IndexedDB key/value store
  // =====================================================================
  var DB_NAME = 'ahmed-kilwa-mobile';
  var STORE = 'kv';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) { var db = e.target.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readonly');
        var r = t.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbSet(key, val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(val, key);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function idbDel(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(key);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function idbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).clear();
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  // collection helpers: col:<name> holds a plain array of rows
  function col(name) { return idbGet('col:' + name).then(function (v) { return Array.isArray(v) ? v : []; }); }
  function saveCol(name, arr) { return idbSet('col:' + name, arr); }
  function getObj(key, def) { return idbGet(key).then(function (v) { return v !== undefined && v !== null ? v : def; }); }
  function setObj(key, val) { return idbSet(key, val); }

  // =====================================================================
  // settings / user / onboarding (mirrors desktop engine shapes)
  // =====================================================================
  function defaultSettings() {
    var base = {
      theme: 'dark',
      accent: 'purple',
      density: 'comfortable',
      animations: true,
      reduceMotion: false,
      fontSize: 'md',
      language: 'en',
      weekStartsOn: 1,
      soundEnabled: true,
      vibrationEnabled: true,
      notificationsEnabled: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
      reminderBeforeMinutes: 15,
      dailySummaryEnabled: true,
      dailySummaryTime: '06:00',
      prayerRemindersEnabled: false,
      focusDefaultDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      notifications: { general: true, tasks: true, habits: true, classes: true },
    };
    base.createdAt = nowIso();
    base.updatedAt = nowIso();
    return base;
  }

  function defaultUser() {
    return {
      id: 'user-1',
      name: 'Ahmed',
      language: 'en',
      weekStartsOn: 1,
      wakeTime: '06:00',
      sleepTime: '22:30',
      workingHours: 8,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  function getSettings() { return getObj('settings', defaultSettings()); }
  function saveSettings(s) { return setObj('settings', s); }
  function getUserObj() { return getObj('user', defaultUser()); }
  function saveUser(u) { return setObj('user', u); }

  // =====================================================================
  // events (mirrors preload .on + desktop emit)
  // =====================================================================
  var listeners = {};
  function emit(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[channel] || []).slice().forEach(function (cb) {
      try { cb.apply(null, args); } catch (e) { /* ignore */ }
    });
  }
  function on(channel, cb) {
    (listeners[channel] = listeners[channel] || []).push(cb);
    return function () {
      var arr = listeners[channel] || [];
      var idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }
  function emitDataChanged() { emit('data:changed', {}); }

  // =====================================================================
  // in-app notifications (bell) — rows mirroring notification_item
  // =====================================================================
  function mapNotification(r) {
    return {
      id: r.id,
      at: r.at,
      title: r.title,
      body: r.body || '',
      type: r.type || 'info',
      entityId: r.entityId || null,
      entityType: r.entityType || null,
      targetPage: r.targetPage || null,
      targetDate: r.targetDate || null,
      read: !!r.read,
      readAt: r.readAt || null,
      dismissedAt: r.dismissedAt || null,
      resolvedAt: r.resolvedAt || null,
    };
  }

  function addNotificationRow(n) {
    return col('notifications').then(function (rows) {
      rows.unshift(n);
      return saveCol('notifications', rows.slice(0, 1000));
    });
  }

  // duplicate guard: one active row per entity+targetDate
  function insertIfNew(entityType, entityId, targetDate, title, body, type, page) {
    return col('notifications').then(function (rows) {
      var dup = rows.some(function (n) { return n.entityType === entityType && n.entityId === entityId && n.targetDate === targetDate && !n.read; });
      if (dup) return null;
      var n = {
        id: uid('notif'),
        at: nowIso(),
        title: title,
        body: body || '',
        type: type || 'info',
        entityId: entityId || null,
        entityType: entityType || null,
        targetPage: page || null,
        targetDate: targetDate || null,
        read: false,
        readAt: null,
        dismissedAt: null,
        resolvedAt: null,
      };
      return addNotificationRow(n).then(function () { return n; });
    });
  }

  function listNotifications() {
    return col('notifications').then(function (rows) {
      rows.sort(function (a, b) { return b.at < a.at ? -1 : b.at > a.at ? 1 : 0; });
      return rows.slice(0, 300).map(mapNotification);
    });
  }
  function unreadCount() {
    return col('notifications').then(function (rows) {
      return rows.filter(function (n) { return !n.read && !n.dismissedAt && !n.resolvedAt; }).length;
    });
  }
  function notifGet(id) {
    return col('notifications').then(function (rows) {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
      return null;
    });
  }
  function notifPatch(id, patch) {
    return col('notifications').then(function (rows) {
      var changed = false;
      var now = nowIso();
      rows = rows.map(function (n) {
        if (n.id !== id) return n;
        changed = true;
        var o = merge(n, patch);
        if (patch.read) { if (!o.readAt) o.readAt = now; }
        if (patch.dismissedAt) { o.read = true; if (!o.readAt) o.readAt = now; }
        if (patch.resolvedAt) { o.read = true; if (!o.readAt) o.readAt = now; }
        return o;
      });
      if (!changed) return null;
      return saveCol('notifications', rows).then(function () { return rows.filter(function (n) { return n.id === id; })[0] || null; });
    });
  }
  function resolveNotificationsFor(entityType, entityId) {
    return col('notifications').then(function (rows) {
      var now = nowIso();
      var changed = false;
      rows = rows.map(function (n) {
        if (n.entityType === entityType && n.entityId === entityId && !n.read) {
          changed = true;
          n.read = true; n.readAt = n.readAt || now; n.resolvedAt = n.resolvedAt || now;
        }
        return n;
      });
      return changed ? saveCol('notifications', rows) : null;
    });
  }
  function pruneStale() {
    return Promise.all([col('notifications'), col('tasks')]).then(function (both) {
      var rows = both[0], tasks = both[1];
      var now = nowIso();
      var changed = false;
      rows = rows.map(function (n) {
        if (n.entityType === 'task' && !n.read) {
          var t = null;
          for (var i = 0; i < tasks.length; i++) if (tasks[i].id === n.entityId) t = tasks[i];
          if (!t || t.status === 'completed' || t.status === 'cancelled' || t.archiveStatus === 'trashed') {
            changed = true;
            n.read = true; n.readAt = n.readAt || now; n.resolvedAt = n.resolvedAt || now;
          }
        }
        return n;
      });
      if (!changed) return 0;
      return saveCol('notifications', rows).then(function () { return 1; });
    });
  }

  // =====================================================================
  // tasks
  // =====================================================================
  function mapTask(r) {
    return {
      id: r.id,
      title: r.title,
      description: r.description || '',
      priority: r.priority || 'p3',
      status: r.status || 'next',
      dueDate: r.dueDate || null,
      dueTime: r.dueTime || null,
      startDate: r.startDate || null,
      estimateMinutes: r.estimateMinutes || null,
      actualTimeMinutes: r.actualTimeMinutes || null,
      projectId: r.projectId || null,
      goalId: r.goalId || null,
      habitId: r.habitId || null,
      routineId: r.routineId || null,
      goalContribution: r.goalContribution != null ? Number(r.goalContribution) : null,
      tags: r.tags || '',
      recurrence: r.recurrence || 'none',
      recurrenceEnd: r.recurrenceEnd || null,
      reminderAt: r.reminderAt || null,
      energy: r.energy || null,
      context: r.context || null,
      notes: r.notes || '',
      blockedById: r.blockedById || null,
      plannedStart: r.plannedStart || null,
      plannedEnd: r.plannedEnd || null,
      timesRescheduled: r.timesRescheduled || 0,
      timesPostponed: r.timesPostponed || 0,
      archiveStatus: r.archiveStatus || 'active',
      completedAt: r.completedAt || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt || r.createdAt,
      version: r.version || 1,
    };
  }

  function allTasks() { return col('tasks'); }
  function listTasks(includeArchived) {
    return col('tasks').then(function (rows) {
      var out = includeArchived ? rows : rows.filter(function (t) { return t.archiveStatus === 'active'; });
      out.sort(function (a, b) { return (a.dueDate || '9999-99-99') < (b.dueDate || '9999-99-99') ? 1 : (a.dueDate || '9999-99-99') > (b.dueDate || '9999-99-99') ? -1 : 0; });
      return col('subtasks').then(function (subs) {
        return out.map(function (t) { return attachSubtasks(mapTask(t), subs.filter(function (s) { return s.taskId === t.id; })); });
      });
    });
  }
  function attachSubtasks(task, subs) {
    task.subtasks = subs.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).map(function (s) {
      return { id: s.id, taskId: s.taskId, title: s.title, completed: !!(s.completed === true || s.completed === 1 || s.done === true), createdAt: s.createdAt };
    });
    return task;
  }
  function getTask(id) {
    return col('tasks').then(function (rows) {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
      return null;
    }).then(function (r) {
      if (!r) return null;
      return col('subtasks').then(function (subs) {
        return attachSubtasks(mapTask(r), subs.filter(function (s) { return s.taskId === id; }));
      });
    });
  }
  function saveTasks(rows) { return saveCol('tasks', rows); }
  function isOpenTask(t) { return t.status !== 'completed' && t.status !== 'cancelled' && t.archiveStatus === 'active'; }

  function createTask(input) {
    input = input || {};
    var now = nowIso();
    var t = {
      id: uid('task'),
      title: String(input.title || '').trim() || 'Untitled',
      description: input.description || '',
      priority: input.priority || 'p3',
      status: input.status || (input.dueDate || input.plannedStart ? 'planned' : 'inbox'),
      dueDate: input.dueDate || null,
      dueTime: input.dueTime || null,
      startDate: input.startDate || null,
      estimateMinutes: input.estimateMinutes || input.estimate || null,
      actualTimeMinutes: null,
      projectId: input.projectId || null,
      goalId: input.goalId || null,
      habitId: input.habitId || null,
      routineId: input.routineId || null,
      goalContribution: input.goalContribution != null ? Number(input.goalContribution) : null,
      tags: input.tags ? String(input.tags) : '',
      recurrence: input.recurrence || 'none',
      recurrenceEnd: input.recurrenceEnd || null,
      reminderAt: input.reminderAt || null,
      energy: input.energy || null,
      context: input.context || null,
      notes: input.notes || '',
      blockedById: null,
      plannedStart: input.plannedStart || null,
      plannedEnd: input.plannedEnd || null,
      timesRescheduled: 0,
      timesPostponed: 0,
      archiveStatus: 'active',
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    return col('tasks').then(function (rows) {
      rows.unshift(t);
      return saveTasks(rows);
    }).then(function () {
      emitDataChanged();
      scheduleResync();
      return mapTask(t);
    });
  }

  function updateTask(id, patch) {
    patch = patch || {};
    return col('tasks').then(function (rows) {
      var found = null;
      rows = rows.map(function (r) {
        if (r.id !== id) return r;
        var now = nowIso();
        var o = merge(r, patch);
        if (patch.status === 'completed' && !o.completedAt) o.completedAt = now;
        if (patch.status && patch.status !== 'completed' && o.completedAt && r.status === 'completed') o.completedAt = null;
        o.updatedAt = now;
        o.version = (o.version || 1) + 1;
        found = o;
        return o;
      });
      if (!found) return null;
      return saveTasks(rows).then(function () { return found; });
    }).then(function (t) {
      if (!t) return null;
      emitDataChanged();
      if (t.status === 'completed' || t.status === 'cancelled' || t.archiveStatus) resolveNotificationsFor('task', id);
      scheduleResync();
      var after = t.goalId ? recomputeGoalProgress(t.goalId) : Promise.resolve(null);
      return after.then(function () { return t ? mapTask(t) : null; });
    });
  }

  function toggleTask(id) {
    return getTask(id).then(function (t) {
      if (!t) return null;
      var completed = t.status === 'completed';
      var next = completed ? (t.dueDate || t.plannedStart ? 'planned' : 'inbox') : 'completed';
      var patch = { status: next };
      if (completed) patch.completedAt = null; else patch.completedAt = nowIso();
      return updateTask(id, patch);
    });
  }

  function deleteTask(id, permanent) {
    var linkedGoal = null;
    return col('tasks').then(function (rows) {
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) idx = i;
      if (idx === -1) return false;
      linkedGoal = rows[idx].goalId || null;
      if (permanent) {
        rows.splice(idx, 1);
      } else {
        rows[idx].archiveStatus = 'trashed';
        rows[idx].updatedAt = nowIso();
      }
      return saveTasks(rows).then(function () { return true; });
    }).then(function (ok) {
      if (!ok) return false;
      resolveNotificationsFor('task', id);
      emitDataChanged();
      scheduleResync();
      return linkedGoal ? recomputeGoalProgress(linkedGoal).then(function () { return true; }) : true;
    });
  }
  function archiveTask(id) {
    return updateTask(id, { archiveStatus: 'archived' });
  }
  function restoreTask(id) {
    return updateTask(id, { archiveStatus: 'active' });
  }

  function listSubtasks(taskId) {
    return col('subtasks').then(function (rows) {
      return rows.filter(function (s) { return s.taskId === taskId; }).map(function (s) {
        return { id: s.id, taskId: s.taskId, title: s.title, completed: !!(s.completed === true || s.completed === 1 || s.done === true), createdAt: s.createdAt };
      });
    });
  }
  function addSubtask(taskId, title) {
    var s = { id: uid('sub'), taskId: taskId, title: String(title || '').trim(), completed: false, createdAt: nowIso() };
    return col('subtasks').then(function (rows) {
      rows.push(s);
      return saveCol('subtasks', rows);
    }).then(function () { emitDataChanged(); return s; });
  }
  function toggleSubtask(id) {
    return col('subtasks').then(function (rows) {
      var found = null;
      rows = rows.map(function (s) {
        if (s.id === id) {
          var val = !(s.completed === true || s.completed === 1 || s.done === true);
          s.completed = val;
          s.done = val;
          found = s;
        }
        return s;
      });
      return saveCol('subtasks', rows).then(function () { return found; });
    }).then(function (s) {
      if (s) emitDataChanged();
      return s ? { id: s.id, taskId: s.taskId, title: s.title, completed: !!s.completed, createdAt: s.createdAt } : null;
    });
  }
  function deleteSubtask(id) {
    return col('subtasks').then(function (rows) {
      rows = rows.filter(function (s) { return s.id !== id; });
      return saveCol('subtasks', rows).then(function () { return true; });
    }).then(function (ok) { if (ok) emitDataChanged(); return ok; });
  }

  var TASK_HISTORY_MAX = 60;
  function taskHistory(taskId) {
    return col('tasksHistory').then(function (rows) {
      return rows.filter(function (h) { return h.taskId === taskId; }).sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; }).slice(0, 30);
    });
  }
  function addTaskHistory(taskId, action, title) {
    return col('tasksHistory').then(function (rows) {
      rows.unshift({ id: uid('th'), taskId: taskId, action: action, title: String(title || '').slice(0, 120), at: nowIso() });
      return saveCol('tasksHistory', rows.slice(0, TASK_HISTORY_MAX));
    });
  }

  function quickCaptureParse(title, input) {
    input = input || {};
    var text = String(title || '').trim();
    var result = { title: text, dueDate: input.dueDate || null, dueTime: input.dueTime || null, priority: null, tags: (input.tags || []).slice(), estimateMinutes: null };
    if (!result.dueDate) {
      var md = text.match(/\b(today|tomorrow|tmrw|yesterday|next week|in \d+ days?|next (sun|mon|tue|wed|thu|fri|sat)[a-z]*)\b/i);
      if (md) { var nd = parseNaturalDate(md[1]); if (nd) { result.dueDate = nd; text = text.replace(md[1], ' ').trim(); } }
    }
    if (!result.dueTime) {
      var mt = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
      if (mt) { var pt = parseTime(mt[1]); if (pt) { result.dueTime = pt; text = text.replace(mt[1], ' ').trim(); } }
    }
    var pr = parsePriority(text);
    if (pr) { result.priority = pr; text = text.replace(/(^|\s)p[1-4](\s|$)/i, ' ').replace(/\s+(urgent|important|normal|low)\b/i, ' ').trim(); }
    var tags = parseTags(text);
    if (tags.length) { result.tags = Array.from(new Set(result.tags.concat(tags))); text = text.replace(/#[a-zA-Z0-9_\-]+/g, ' ').trim(); }
    var dur = parseDuration(text);
    if (dur !== null) { result.estimateMinutes = dur; text = text.replace(/(^|\s)(in|for|at|every|about)\s+\d+\s*(?:min|minutes?|m|hr|hour|hours?|h)(?:$|\s)/i, ' ').trim(); }
    result.title = text.replace(/\s+/g, ' ').trim() || String(title || '').trim();
    return result;
  }

  function scheduleTask(id, start, end) {
    return updateTask(id, { plannedStart: start || null, plannedEnd: end || null, status: 'scheduled' });
  }
  function rescheduleTask(id, dueDate, dueTime) {
    return getTask(id).then(function (t) {
      if (!t) return null;
      return updateTask(id, { dueDate: dueDate || null, dueTime: dueTime || null, timesRescheduled: (t.timesRescheduled || 0) + 1 });
    });
  }

  function todayTasksList() {
    return col('tasks').then(function (rows) {
      var today = todayStr();
      return rows
        .filter(function (t) { return t.archiveStatus === 'active' && t.dueDate === today && t.status !== 'cancelled'; })
        .sort(function (a, b) { return (a.dueTime || '23:59') < (b.dueTime || '23:59') ? -1 : (a.dueTime || '23:59') > (b.dueTime || '23:59') ? 1 : 0; })
        .map(mapTask);
    });
  }
  function overdueTasksList() {
    return col('tasks').then(function (rows) {
      var today = todayStr();
      return rows.filter(function (t) { return isOpenTask(t) && t.dueDate && t.dueDate < today; }).sort(function (a, b) {
        return (a.dueDate || '') < (b.dueDate || '') ? -1 : (a.dueDate || '') > (b.dueDate || '') ? 1 : 0;
      }).map(mapTask);
    });
  }
  function upcomingTasksList(days) {
    days = Number(days) > 0 ? Number(days) : 7;
    return col('tasks').then(function (rows) {
      var today = todayStr();
      var end = addDays(today, days);
      return rows.filter(function (t) { return isOpenTask(t) && t.dueDate && t.dueDate >= today && t.dueDate <= end; }).sort(function (a, b) {
        return (a.dueDate || '') < (b.dueDate || '') ? -1 : (a.dueDate || '') > (b.dueDate || '') ? 1 : 0;
      }).map(mapTask);
    });
  }

  // =====================================================================
  // habits
  // =====================================================================
  function defaultHabit() {
    var t = todayStr();
    return { id: uid('habit'), name: '', description: '', icon: 'target', color: '#8b5cf6', category: '', priority: 'p2', type: 'binary', frequency: 'daily', frequencyValue: 1, weekdayMask: '1111111', targetValue: 1, unit: '', startDate: t, endDate: null, reminderTime: null, tags: '', goalId: null, projectId: null, routineId: null, goalContribution: null, positive: true, notes: '', sort: 0, isActive: true, archived: false, createdAt: nowIso(), updatedAt: nowIso() };
  }
  function mapHabit(r) {
    var h = merge(defaultHabit(), r);
    if (h.type === 'bool') h.type = 'binary';
    if (h.isActive == null) h.isActive = !h.archived;
    return h;
  }
  function listHabits(includeArchived) {
    return col('habits').then(function (rows) {
      var out = includeArchived ? rows : rows.filter(function (h) { return !h.archived; });
      out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return out.map(mapHabit);
    });
  }
  function getHabit(id) {
    return col('habits').then(function (rows) { for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return mapHabit(rows[i]); return null; });
  }
  function getLog(habitId, date) {
    return col('habitLog').then(function (rows) {
      for (var i = 0; i < rows.length; i++) if (rows[i].habitId === habitId && rows[i].date === date) return rows[i];
      return null;
    });
  }
  function setHabitLog(habitId, date, status, value) {
    status = status || 'not_scheduled';
    if (status === 'done') status = 'completed';
    if (status === 'none') status = 'not_scheduled';
    var finalValue = value != null ? value : (status === 'completed' || status === 'partial' ? 1 : 0);
    return col('habitLog').then(function (rows) {
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].habitId === habitId && rows[i].date === date) idx = i;
      var row = { habitId: habitId, date: date, status: status, value: finalValue, updatedAt: nowIso() };
      if (idx !== -1) rows[idx] = row; else rows.push(row);
      return saveCol('habitLog', rows).then(function () { return row; });
    }).then(function (row) {
      emitDataChanged();
      return getHabit(habitId).then(function (h) {
        return h && h.goalId ? recomputeGoalProgress(h.goalId).then(function () { return row; }) : row;
      });
    });
  }
  function removeLog(habitId, date) {
    return col('habitLog').then(function (rows) {
      rows = rows.filter(function (l) { return !(l.habitId === habitId && l.date === date); });
      return saveCol('habitLog', rows);
    }).then(function () {
      emitDataChanged();
      return getHabit(habitId).then(function (h) {
        return h && h.goalId ? recomputeGoalProgress(h.goalId) : null;
      });
    });
  }
  function toggleHabit(habitId, date) {
    var next;
    return getLog(habitId, date).then(function (log) {
      var existing = log && (log.status === 'completed' || log.status === 'done');
      next = existing ? 'missed' : 'completed';
      return setHabitLog(habitId, date, next);
    }).then(function (row) {
      if (next === 'completed' && date === todayStr()) return resolveNotificationsFor('habit', habitId).then(function () { return row; });
      return row;
    });
  }
  function habitLogsRange(habitId, start, end) {
    return col('habitLog').then(function (rows) {
      return rows.filter(function (l) { return l.habitId === habitId && l.date >= start && l.date <= end; });
    });
  }
  function habitStats(habitId) {
    return listHabits(true).then(function () {
      return col('habitLog').then(function (rows) {
        var mine = rows.filter(function (l) { return l.habitId === habitId; });
        var completedCount = mine.filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).length;
        var skipped = mine.filter(function (l) { return l.status === 'skipped'; }).length;
        var total = mine.length;
        var completedDates = mine.filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).map(function (l) { return l.date; }).sort();
        var currentStreak = 0;
        var cursor = todayStr();
        for (var i = 0; i < 2000; i++) {
          var found = null;
          for (var j = 0; j < mine.length; j++) if (mine[j].date === cursor) { found = mine[j]; break; }
          if (found && (found.status === 'completed' || found.status === 'done')) { currentStreak++; cursor = addDays(cursor, -1); }
          else break;
        }
        var longestStreak = 0;
        var run = 0;
        var allDates = completedDates.slice();
        if (allDates.indexOf(todayStr()) === -1) allDates.push(todayStr());
        allDates.sort();
        var prev = null;
        for (var k = 0; k < allDates.length; k++) {
          var d = allDates[k];
          if (completedDates.indexOf(d) !== -1 && (prev === null || parseDate(d).getTime() - parseDate(prev).getTime() === 86400000)) run++;
          else run = 0;
          longestStreak = Math.max(longestStreak, run);
          prev = d;
        }
        var completionRate = total ? Math.round((completedCount / total) * 100) : 0;
        var month = todayStr().slice(0, 7);
        var monthRows = mine.filter(function (l) { return l.date.indexOf(month) === 0; });
        var monthCompleted = monthRows.filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).length;
        var monthlyRate = monthRows.length ? Math.round((monthCompleted / monthRows.length) * 100) : 0;
        return {
          habit: null,
          total: total,
          completedCount: completedCount,
          missedCount: mine.length - completedCount - skipped,
          currentStreak: currentStreak,
          longestStreak: longestStreak,
          completionRate: completionRate,
          monthlyRate: monthlyRate,
          bestStreak: longestStreak,
          lastCompleted: completedDates[completedDates.length - 1] || null,
          done: completedCount,
          skipped: skipped,
          percentage: completionRate,
          logs: mine.sort(function (a, b) { return a.date < b.date ? -1 : 1; }),
        };
      });
    });
  }
  function habitStrength(habitId) {
    return habitLogsRange(habitId, addDays(todayStr(), -6), todayStr()).then(function (rows) {
      var done = rows.filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).length;
      return Math.min(100, Math.round((done / 7) * 100));
    });
  }
  function weekRows(weekStartsOn) {
    weekStartsOn = Number(weekStartsOn) || 1;
    return listHabits(false).then(function (habits) {
      var start = todayStr();
      var d = parseDate(start);
      var diff = (d.getDay() - weekStartsOn + 7) % 7;
      d.setDate(d.getDate() - diff);
      var days = [];
      for (var i = 0; i < 7; i++) { var dd = new Date(d); dd.setDate(d.getDate() + i); days.push(toDateStr(dd)); }
      return col('habitLog').then(function (rows) {
        var logMap = {};
        for (var j = 0; j < rows.length; j++) logMap[rows[j].habitId + '|' + rows[j].date] = rows[j].status;
        return {
          days: days,
          habits: habits.map(function (h) {
            return {
              habit: h,
              cells: days.map(function (day) {
                var st = logMap[h.id + '|' + day] || 'not_scheduled';
                if (st === 'done') st = 'completed';
                if (st === 'none') st = 'not_scheduled';
                return st;
              }),
            };
          }),
        };
      });
    });
  }
  function monthMatrix(year, month) {
    return listHabits(false).then(function (habits) {
      var y = Number(year) || new Date().getFullYear();
      var m = Number(month) || new Date().getMonth() + 1;
      var dayCount = new Date(y, m, 0).getDate();
      var prefix = y + '-' + PAD(m);
      return col('habitLog').then(function (rows) {
        var logMap = {};
        for (var j = 0; j < rows.length; j++) logMap[rows[j].habitId + '|' + rows[j].date] = rows[j];
        return {
          year: y,
          month: m,
          days: dayCount,
          habits: habits.map(function (h) {
            return {
              habit: h,
              cells: Array.from({ length: dayCount }, function (_, i) {
                var date = prefix + '-' + PAD(i + 1);
                var l = logMap[h.id + '|' + date] || null;
                if (!l) return null;
                return { id: l.id, habitId: l.habitId, date: l.date, status: l.status === 'done' ? 'completed' : l.status, value: l.value != null ? l.value : (l.status === 'completed' || l.status === 'done' ? 1 : 0), note: '', createdAt: l.createdAt, updatedAt: l.updatedAt };
              }),
            };
          }),
        };
      });
    });
  }
  function freezeStreak(habitId, date) { return setHabitLog(habitId, date, 'skipped'); }
  function unfreezeStreak(habitId, date) { return removeLog(habitId, date); }

  // =====================================================================
  // goals / projects / routines (same IPC shape as desktop)
  // =====================================================================
  function createEntity(name, input) {
    var now = nowIso();
    input = input || {};
    var e = {
      id: uid(name),
      title: String(input.title || input.name || '').trim() || 'Untitled',
      name: String(input.name || input.title || '').trim() || 'Untitled',
      description: input.description || '',
      color: input.color || '#8b5cf6',
      icon: input.icon || null,
      status: input.status || (name === 'goal' ? 'in_progress' : 'active'),
      target: input.target || null,
      unit: input.unit || (name === 'goal' ? 'steps' : ''),
      deadline: input.deadline || null,
      archived: !!input.archived,
      createdAt: now,
      updatedAt: now,
    };
    if (name === 'goal') {
      e.category = input.category || 'general';
      e.type = input.type || 'binary';
      e.targetValue = input.targetValue != null ? Number(input.targetValue) : (input.target != null ? Number(input.target) : 10);
      e.currentValue = input.currentValue != null ? Number(input.currentValue) : 0;
      e.priority = input.priority || 'p2';
      e.notes = input.notes || '';
      e.visionId = input.visionId || null;
      e.parentGoalId = input.parentGoalId || null;
      e.startDate = input.startDate || todayStr();
      e.isSmart = !!(input.isSmart === true || input.isSmart === 1);
      e.baseValue = e.isSmart ? Number(input.baseValue != null ? input.baseValue : e.currentValue) || 0 : 0;
      if (e.isSmart) e.currentValue = e.baseValue;
    }
    return e;
  }
  function listEntities(colName, includeArchived) {
    return col(colName).then(function (rows) {
      var out = includeArchived ? rows.slice() : rows.filter(function (r) { return !r.archived; });
      out.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
      return out;
    });
  }
  function getEntity(colName, id) {
    return col(colName).then(function (rows) { for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i]; return null; });
  }
  function saveEntity(colName, e) {
    return col(colName).then(function (rows) {
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === e.id) idx = i;
      if (idx !== -1) rows[idx] = e; else rows.push(e);
      return saveCol(colName, rows);
    });
  }
  function deleteEntity(colName, id) {
    return col(colName).then(function (rows) {
      rows = rows.filter(function (r) { return r.id !== id; });
      return saveCol(colName, rows);
    });
  }
  function goalProgress(goalId) {
    return Promise.all([col('goalSteps'), getEntity('goals', goalId)]).then(function (both) {
      var steps = both[0];
      var g = both[1] || {};
      var mine = steps.filter(function (s) { return s.goalId === goalId; });
      var done = mine.filter(function (s) { return s.completed === true || s.completed === 1 || s.status === 'done'; }).length;
      var pct = mine.length ? Math.round((done / mine.length) * 100) : (Number(g.targetValue) ? clamp(Math.round((Number(g.currentValue) || 0) / Number(g.targetValue) * 100), 0, 100) : 0);
      return { total: mine.length, done: done, completed: done, pct: pct, status: g.status || 'in_progress', currentValue: g.currentValue || 0, targetValue: g.targetValue || null };
    });
  }

  // SMART-aware status: completed at 99%+, else at_risk / overdue / not_started
  // computed from deadline + progress (mirrors desktop completed logic, adds risk states).
  function computeSmartGoalStatus(g, today, pct) {
    if (pct >= 99) return 'completed';
    var deadline = g.deadline ? String(g.deadline).slice(0, 10) : null;
    var startDate = g.startDate ? String(g.startDate).slice(0, 10) : null;
    if (pct <= 0 && startDate && startDate > today && (g.status === 'not_started' || g.status === 'in_progress')) return 'not_started';
    if (deadline && deadline < today) return 'overdue';
    if (deadline) {
      var daysLeft = Math.round((parseDate(deadline).getTime() - parseDate(today).getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 7 && pct < 60) return 'at_risk';
    }
    return (g.status === 'completed' && pct < 99) ? 'in_progress' : (g.status || 'in_progress');
  }

  // Mirrors desktop recomputeGoalProgress: a goal becomes 'completed' once its
  // progress reaches 99%+, and its currentValue tracks the percentage of
  // targetValue. Progress = goal steps (weighted 70%) + linked habits (30%)
  // when both exist, else steps alone, else current/target. Runs after any
  // step / habit / task mutation tied to the goal.
  // Smart goals (isSmart) instead accumulate real units from baseValue, linked
  // tasks, habit check-ins and milestone steps — exactly like the desktop.
  var UNIT_ALIASES = {};
  function unitDef(canonical, category, factor, aliases) {
    var d = { canonical: canonical, category: category, factor: factor };
    for (var ai = 0; ai < aliases.length; ai++) UNIT_ALIASES[aliases[ai]] = d;
  }
  unitDef('minutes', 'time', 1, ['min', 'mins', 'minute', 'minutes', 'min(s)', 'د', 'دقيقة', 'دقائق']);
  unitDef('hours', 'time', 60, ['hr', 'hrs', 'hour', 'hours', 'hour(s)', 'h', 'س', 'سا', 'ساعة', 'ساعات']);
  unitDef('days', 'time', 1440, ['day', 'days', 'يوم', 'أيام', 'dy']);
  unitDef('seconds', 'time', 1 / 60, ['sec', 'secs', 'second', 'seconds', 'ث', 'ثانية', 'ثواني']);
  unitDef('meters', 'length', 1, ['meter', 'meters', 'metre', 'metres', 'متر', 'أمتار', 'm']);
  unitDef('kilometers', 'length', 1000, ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'كيلومتر']);
  unitDef('centimeters', 'length', 0.01, ['cm', 'centimeter', 'centimeters', 'سنتيمتر']);
  unitDef('millimeters', 'length', 0.001, ['mm', 'millimeter', 'millimeters', 'ملليمتر']);
  unitDef('miles', 'length', 1609.344, ['mi', 'mile', 'miles', 'ميل']);
  unitDef('feet', 'length', 0.3048, ['ft', 'foot', 'feet', 'قدم']);
  unitDef('inches', 'length', 0.0254, ['in', 'inch', 'inches', 'بوصة']);
  unitDef('liters', 'volume', 1, ['l', 'litre', 'liter', 'litres', 'liters', 'لتر', 'لترات']);
  unitDef('milliliters', 'volume', 0.001, ['ml', 'milliliter', 'milliliters', 'مل']);
  unitDef('gallons', 'volume', 3.78541178, ['gal', 'gallon', 'gallons', 'غالون']);
  unitDef('grams', 'mass', 1, ['g', 'gram', 'grams', 'غرام', 'جرام']);
  unitDef('kilograms', 'mass', 1000, ['kg', 'kilo', 'kilogram', 'kilograms', 'كيلوغرام', 'كجم']);
  unitDef('pounds', 'mass', 453.59237, ['lb', 'lbs', 'pound', 'pounds', 'باوند']);
  unitDef('ounces', 'mass', 28.349523, ['oz', 'ounce', 'ounces', 'أونصة']);
  var COUNT_UNITS = ['count', 'counts', 'task', 'tasks', 'item', 'items', 'page', 'pages', 'book', 'books', 'topic', 'topics', 'word', 'words', 'step', 'steps', 'session', 'sessions', 'chapter', 'chapters', 'money', 'percentage', 'percent', '%'];
  function normalizeUnit(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (UNIT_ALIASES[s]) return UNIT_ALIASES[s];
    if (COUNT_UNITS.indexOf(s) !== -1) return { canonical: s, category: 'count', factor: 1 };
    return { canonical: s, category: 'custom', factor: 1 };
  }
  function unitCategoryShim(raw) { var u = normalizeUnit(raw); return u ? u.category : null; }
  function convertValueShim(value, fromRaw, toRaw) {
    var f = normalizeUnit(fromRaw);
    var t = normalizeUnit(toRaw);
    if (!f || !t) return null;
    if (f.canonical === t.canonical) return value;
    if (f.category !== t.category) return null;
    if (f.category === 'count' || f.category === 'custom') return null;
    return (value * f.factor) / t.factor;
  }
  function smartIsTime(u) { return unitCategoryShim(u) === 'time'; }
  function smartMinutesToUnit(minutes, unit) { var c = convertValueShim(minutes, 'minutes', unit); return c != null ? c : minutes; }
  function numberOrNullShim(v) {
    if (v == null || v === '' || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : null;
  }
  function stepSmartContributionShim(step) {
    if (!(step && (step.completed === true || step.completed === 1))) return 0;
    if (step.countsTowardProgress === false || step.countsTowardProgress === 0) return 0;
    var v = Number(step.value);
    if (isFinite(v) && v > 0) return v;
    if (v === 0) return 0;
    return 1;
  }
  function resolveTaskContributionShim(t, gUnit) {
    var explicit = numberOrNullShim(t.goalContribution);
    if (explicit !== null) return { value: explicit, origin: 'explicit' };
    var est = Number(t.estimateMinutes) || 0;
    var cat = unitCategoryShim(gUnit);
    if (est > 0 && cat === 'time') { var conv = convertValueShim(est, 'minutes', gUnit); if (conv != null) return { value: conv, origin: 'estimate' }; }
    if (cat === 'count') return { value: 1, origin: 'count' };
    return { value: 0, origin: 'none' };
  }
  function resolveHabitContributionShim(h, gUnit) {
    var explicit = numberOrNullShim(h.goalContribution);
    if (explicit !== null) return { value: explicit, origin: 'explicit' };
    var hv = Number(h.targetValue) || 0;
    if (hv > 0) { var conv = convertValueShim(hv, h.unit || '', gUnit); if (conv != null && conv > 0) return { value: conv, origin: 'unit' }; }
    if (unitCategoryShim(gUnit) === 'count') return { value: 1, origin: 'count' };
    return { value: 0, origin: 'none' };
  }
  function smartTaskContribution(t, gUnit) {
    if (!(t.status === 'completed' || t.status === 'done')) return 0;
    return resolveTaskContributionShim(t, gUnit).value;
  }
  function smartHabitContribution(h, gUnit) { return resolveHabitContributionShim(h, gUnit).value; }
  function computeSmartCurrentShim(g, steps, tasks, habits, logs) {
    var gUnit = g.unit || '';
    var base = Number(g.baseValue) || 0;
    var stepsContribution = 0;
    for (var si8 = 0; si8 < steps.length; si8++) stepsContribution += stepSmartContributionShim(steps[si8]);
    var tasksContribution = 0, habitsContribution = 0;
    var taskMeta = [], habitMeta = [], warnings = [];
    for (var ti0 = 0; ti0 < tasks.length; ti0++) {
      var tt = tasks[ti0];
      var done = tt.status === 'completed' || tt.status === 'done';
      var res = resolveTaskContributionShim(tt, gUnit);
      tasksContribution += done ? res.value : 0;
      var warn = res.origin === 'none';
      if (warn) warnings.push({ type: 'task', id: tt.id, title: tt.title || '' });
      taskMeta.push({ id: tt.id, title: tt.title || '', done: done, value: done ? res.value : 0, origin: res.origin, warning: warn, status: tt.status || '' });
    }
    for (var hi0 = 0; hi0 < habits.length; hi0++) {
      var hh = habits[hi0];
      var logCount = 0;
      for (var li0 = 0; li0 < logs.length; li0++) if (logs[li0].habitId === hh.id && (logs[li0].status === 'completed' || logs[li0].status === 'done')) logCount++;
      var res2 = resolveHabitContributionShim(hh, gUnit);
      habitsContribution += logCount * res2.value;
      var warn2 = res2.origin === 'none';
      if (warn2) warnings.push({ type: 'habit', id: hh.id, title: hh.name || '' });
      habitMeta.push({ id: hh.id, title: hh.name || '', done: logCount > 0, value: logCount * res2.value, origin: res2.origin, warning: warn2, perLog: res2.value, logCount: logCount, unit: hh.unit || '' });
    }
    return {
      current: base + stepsContribution + tasksContribution + habitsContribution,
      breakdown: { base: base, steps: stepsContribution, tasks: tasksContribution, habits: habitsContribution },
      taskMeta: taskMeta,
      habitMeta: habitMeta,
      warnings: warnings,
    };
  }
  function smartGoalStatus(g, pct) {
    var today = todayStr();
    if (pct >= 99) return 'completed';
    var start = g.startDate ? String(g.startDate).slice(0, 10) : null;
    var deadline = g.deadline ? String(g.deadline).slice(0, 10) : null;
    if (pct <= 0 && start && start > today) return 'not_started';
    if (deadline && deadline < today) return 'overdue';
    if (!deadline) return (g.status === 'on_hold') ? 'on_hold' : 'in_progress';
    var startRef = start && start <= today ? start : today;
    var total = daysBetweenShim(startRef, deadline);
    var elapsed = daysBetweenShim(startRef, today) + 1;
    if (total <= 0 || elapsed <= 0) return 'in_progress';
    var expected = Math.min(100, (elapsed / total) * 100);
    if (pct >= expected * 1.15) return 'ahead';
    if (pct >= expected * 0.9) return 'on_track';
    if (daysBetweenShim(today, deadline) <= 7) return 'at_risk';
    return 'behind';
  }
  function daysBetweenShim(a, b) {
    var pa = parseDate(String(a).slice(0, 10)).getTime();
    var pb = parseDate(String(b).slice(0, 10)).getTime();
    return Math.max(0, Math.round((pb - pa) / 86400000));
  }
  function startOfWeekShim(iso, weekStartsOn) {
    var d = parseDate(iso);
    var diff = (d.getDay() - (weekStartsOn || 1) + 7) % 7;
    d.setDate(d.getDate() - diff);
    return toDateStr(d);
  }

  function recomputeGoalProgress(goalId) {
    var today = todayStr();
    return Promise.all([getEntity('goals', goalId), col('goalSteps'), col('habits'), col('habitLog'), col('tasks')]).then(function (both) {
      var g = both[0];
      if (!g) return Promise.resolve(null);
      var steps = both[1].filter(function (s) { return s.goalId === goalId; });
      var completedSteps = steps.filter(function (s) { return s.completed === true || s.completed === 1 || s.status === 'done'; }).length;
      var stepPct = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
      var linkedHabits = both[2].filter(function (h) { return !h.archived && h.goalId === goalId; });
      var habitScore = 0;
      if (linkedHabits.length > 0) {
        var logRows = both[3];
        for (var hi = 0; hi < linkedHabits.length; hi++) {
          var hRows = logRows.filter(function (l) { return l.habitId === linkedHabits[hi].id && (l.status === 'completed' || l.status === 'done'); });
          habitScore += hRows.length / Math.max(1, linkedHabits.length);
        }
      }
      var linkedTasks = both[4].filter(function (t) { return t.goalId === goalId && t.archiveStatus === 'active'; });
      var taskDone = linkedTasks.filter(function (t) { return t.status === 'completed'; }).length;
      var taskPct = linkedTasks.length > 0 ? (taskDone / linkedTasks.length) * 100 : 0;

      var isSmart = g.isSmart === true || g.isSmart === 1;
      if (isSmart) {
        var scr = computeSmartCurrentShim(g, steps, linkedTasks, linkedHabits, both[3]);
        var smartCurrent = scr.current;
        var smartTarget = Number(g.targetValue) || 0;
        var smartPct = smartTarget > 0 ? clamp((smartCurrent / smartTarget) * 100, 0, 100) : (steps.length > 0 ? stepPct : 0);
        var smartStatus = smartGoalStatus(g, smartPct);
        var smartVal = Math.round(smartCurrent * 100) / 100;
        var mS = merge(g, { currentValue: smartVal, status: smartStatus, updatedAt: nowIso() });
        return saveEntity('goals', mS).then(function () {
          emitDataChanged();
          return { total: steps.length, done: completedSteps, pct: Math.round(smartPct), status: smartStatus, currentValue: smartVal, targetValue: smartTarget };
        });
      }

      var pct = 0;
      if (steps.length > 0 && linkedHabits.length > 0) pct = stepPct * 0.7 + habitScore;
      else if (steps.length > 0) pct = stepPct;
      else if (linkedHabits.length > 0) pct = habitScore;
      else if (linkedTasks.length > 0) pct = taskPct;
      else if (Number(g.targetValue) > 0 && (Number(g.currentValue) > 0 || g.status === 'completed')) pct = clamp(Math.round((Number(g.currentValue) / Number(g.targetValue)) * 10000) / 100, 0, 100);
      else if (g.startDate && g.deadline && g.startDate <= today) pct = (parseDate(today).getTime() - parseDate(g.startDate).getTime()) / Math.max(1, (parseDate(g.deadline).getTime() - parseDate(g.startDate).getTime())) * 100;

      var target = Number(g.targetValue) || 1;
      var current = steps.length > 0 || linkedHabits.length > 0 || linkedTasks.length > 0 ? Math.round(pct / 100 * target * 100) / 100 : Number(g.currentValue);
      var status = computeSmartGoalStatus(g, today, pct);
      var m = merge(g, { currentValue: current, status: status, updatedAt: nowIso() });
      return saveEntity('goals', m).then(function () {
        emitDataChanged();
        return { total: steps.length, done: completedSteps, pct: Math.round(pct), status: status, currentValue: current, targetValue: target };
      });
    });
  }
  function goalSmartStats(goalId) {
    var today = todayStr();
    return Promise.all([getEntity('goals', goalId), col('goalSteps'), col('tasks'), col('habits'), col('habitLog')]).then(function (both) {
      var g = both[0];
      if (!g) return null;
      var steps = both[1].filter(function (s) { return s.goalId === goalId; });
      var doneSteps = steps.filter(function (s) { return s.completed === true || s.completed === 1 || s.status === 'done'; }).length;
      var linkedTasks = both[2].filter(function (t) { return t.goalId === goalId && t.archiveStatus === 'active'; });
      var linkedHabits = both[3].filter(function (h) { return !h.archived && h.goalId === goalId; });
      var completedLogs = both[4].filter(function (l) { return l.status === 'completed' || l.status === 'done'; });

      var csh = computeSmartCurrentShim(g, steps, linkedTasks, linkedHabits, completedLogs);
      var current = csh.current;
      var doneTasks = 0;
      var doneHabits = 0;
      var activeDates = [];
      var i, j;
      for (i = 0; i < linkedTasks.length; i++) {
        if (linkedTasks[i].status === 'completed' || linkedTasks[i].status === 'done') {
          doneTasks++;
          var td = dayOf(linkedTasks[i].completedAt);
          if (td && /^\d{4}-\d{2}-\d{2}$/.test(td)) activeDates.push(td);
        }
      }
      for (i = 0; i < linkedHabits.length; i++) {
        for (j = 0; j < completedLogs.length; j++) {
          if (completedLogs[j].habitId === linkedHabits[i].id) {
            doneHabits++;
            var hd = String(completedLogs[j].date || '').slice(0, 10);
            if (hd) activeDates.push(hd);
          }
        }
      }

      var target = Number(g.targetValue) || 0;
      var pct = target > 0 ? clamp((current / target) * 100, 0, 100) : (steps.length > 0 ? (doneSteps / steps.length) * 100 : 0);
      var status = smartGoalStatus(g, pct);
      var remaining = Math.max(0, target - current);
      var daysLeft = g.deadline ? daysBetweenShim(today, String(g.deadline).slice(0, 10)) : null;
      var startRef = g.startDate && String(g.startDate).slice(0, 10) <= today ? String(g.startDate).slice(0, 10) : today;
      var daysElapsed = Math.max(1, daysBetweenShim(startRef, today) + 1);
      var requiredDaily = daysLeft !== null && daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
      var requiredWeekly = requiredDaily !== null ? requiredDaily * 7 : null;
      var avgDaily = current / daysElapsed;
      var avgWeekly = avgDaily * 7;
      var estimatedCompletionDate = null;
      var estimatedDays = null;
      if (remaining <= 0) { estimatedCompletionDate = today; estimatedDays = 0; }
      else if (avgDaily > 0) { estimatedDays = Math.ceil(remaining / avgDaily); estimatedCompletionDate = addDays(today, estimatedDays); }

      var weekStartDate = startOfWeekShim(today, 1);
      var monthStartDate = String(today).slice(0, 7) + '-01';
      var dateSet = {};
      for (i = 0; i < activeDates.length; i++) dateSet[activeDates[i]] = true;
      var keys = Object.keys(dateSet);
      var weekCount = 0, monthCount = 0;
      for (i = 0; i < keys.length; i++) {
        if (keys[i] >= weekStartDate && keys[i] <= today) weekCount++;
        if (keys[i] >= monthStartDate && keys[i] <= today) monthCount++;
      }
      var curStreak = 0;
      var cDay = dateSet[today] ? today : addDays(today, -1);
      while (dateSet[cDay]) { curStreak++; cDay = addDays(cDay, -1); }
      var sorted = keys.slice().sort();
      var best = 0, run = 0, prev = null;
      for (i = 0; i < sorted.length; i++) {
        if (prev && daysBetweenShim(prev, sorted[i]) === 1) run += 1;
        else run = 1;
        prev = sorted[i];
        if (run > best) best = run;
      }
      var gUnit = String(g.unit || '').trim();
      var todayTasks = [], todayHabits = [], todayActual = 0;
      for (i = 0; i < linkedTasks.length; i++) {
        var tt2 = linkedTasks[i];
        var dueToday = tt2.dueDate === today || (tt2.plannedStart && dayOf(tt2.plannedStart) === today);
        var completedToday = (tt2.status === 'completed' || tt2.status === 'done') && dayOf(tt2.completedAt) === today;
        if (!dueToday && !completedToday) continue;
        var rt = resolveTaskContributionShim(tt2, gUnit);
        if (completedToday) todayActual += rt.value;
        var done2 = tt2.status === 'completed' || tt2.status === 'done';
        todayTasks.push({ id: tt2.id, title: tt2.title || '', done: done2, value: done2 ? rt.value : 0, origin: rt.origin, warning: rt.origin === 'none', status: tt2.status || '' });
      }
      var logsToday = [];
      for (i = 0; i < completedLogs.length; i++) if (String(completedLogs[i].date || '').slice(0, 10) === today) logsToday.push(completedLogs[i]);
      for (i = 0; i < linkedHabits.length; i++) {
        var hh2 = linkedHabits[i];
        var logged = false;
        for (j = 0; j < logsToday.length; j++) if (logsToday[j].habitId === hh2.id) { logged = true; break; }
        var rh = resolveHabitContributionShim(hh2, gUnit);
        if (logged) todayActual += rh.value;
        todayHabits.push({ id: hh2.id, name: hh2.name || '', done: logged, perLog: rh.value, value: logged ? rh.value : 0, origin: rh.origin, warning: rh.origin === 'none', unit: hh2.unit || '' });
      }
      return {
        goal: g,
        isSmart: true,
        progressPct: Math.round(pct),
        currentValue: Math.round(current * 100) / 100,
        targetValue: target,
        remaining: remaining,
        displayUnit: gUnit,
        status: status,
        daysLeft: daysLeft,
        requiredDaily: requiredDaily,
        requiredWeekly: requiredWeekly,
        avgDaily: avgDaily,
        avgWeekly: avgWeekly,
        estimatedCompletionDate: estimatedCompletionDate,
        estimatedDays: estimatedDays,
        contributions: csh.breakdown,
        warnings: csh.warnings,
        milestones: { total: steps.length, done: doneSteps, pct: steps.length ? Math.round((doneSteps / steps.length) * 100) : 0, items: steps },
        links: { tasks: { total: linkedTasks.length, done: doneTasks, items: csh.taskMeta }, habits: { total: linkedHabits.length, done: doneHabits, items: csh.habitMeta } },
        todayActivity: {
          tasks: todayTasks,
          habits: todayHabits,
          actual: Math.round(todayActual * 100) / 100,
          expected: requiredDaily !== null ? requiredDaily : null,
          required: requiredDaily !== null ? requiredDaily : null,
        },
        stats: { today: dateSet[today] ? 1 : 0, week: weekCount, month: monthCount, currentStreak: curStreak, bestStreak: best, activeDays: keys.length, missedDays: Math.max(0, daysElapsed - keys.length), completionRate: Math.round(pct), weekStartDate: weekStartDate, monthStartDate: monthStartDate }
      };
    });
  }
  function suggestSmartStepsShim(goalId) {
    return getEntity('goals', goalId).then(function (g) {
      if (!g) return { milestones: [], tasks: [], habits: [] };
      var s = String((g.name || '') + ' ' + (g.category || '') + ' ' + (g.description || '')).toLowerCase();
      var themed = {
        education: {
          milestones: ['Pick resources & outline', 'Core material (first half)', 'Core material (second half)', 'Practice exams & review', 'Pass final assessment'],
          tasks: ['Study session: core material', 'Hands-on practice', 'Mock test / flashcards'],
          habits: ['Study 50 focused minutes daily', 'Teach back one concept daily', 'Review yesterday\'s notes']
        },
        fitness: {
          milestones: ['Baseline & plan', 'First 2-week block', 'Routine established', 'Hit the first check-in goal'],
          tasks: ['Workout session (strength)', 'Cardio / conditioning', 'Measure & log progress'],
          habits: ['Work out 30 minutes', 'Drink 2L of water', 'Log today\'s training']
        },
        build: {
          milestones: ['Define requirements', 'Core feature (MVP)', 'Polish & test', 'Launch / handoff'],
          tasks: ['Build core feature', 'Fix bugs & test', 'Ship / deploy iteration'],
          habits: ['Code for 25 focused minutes', 'Commit progress daily', 'Daily review & next step']
        },
        finance: {
          milestones: ['Budget baseline', 'Cut first burning cost', 'Automate savings', 'Review & rebalance'],
          tasks: ['Review monthly expenses', 'Set up automatic savings', 'Monthly financial review'],
          habits: ['Log today\'s spending', 'No unnecessary purchases', 'Check balance daily']
        },
        general: {
          milestones: ['Research and outline', 'First major milestone', 'Review and test', 'Final polish & delivery'],
          tasks: ['Start working on "' + (g.name || 'the goal') + '"', 'Deep work session', 'Review progress'],
          habits: ['Spend 25 focused minutes daily', 'Review progress every evening', 'Note one win each day']
        }
      };
      var t = themed.general;
      if (/(learn|study|course|certificate|cert|exam|test|oscp|language|book|read)/.test(s)) t = themed.education;
      else if (/(fitness|health|gym|weight|workout|run|lose|muscle|رياضة|صحة|لياقة|عضلات|وزن)/.test(s)) t = themed.fitness;
      else if (/(build|project|app|ship|portfolio|website|code|coding|develop)/.test(s)) t = themed.build;
      else if (/(save|income|money|budget|financ|ادخار|مال|دخل|ميزانية)/.test(s)) t = themed.finance;
      var unit = String(g.unit || '').trim();
      var target = Number(g.targetValue) || 0;
      var milestones = t.milestones;
      if (target > 0 && unit && unit.toLowerCase() !== 'count' && !/^(task|tasks|item|items|step|steps|sessions|session)$/i.test(unit)) {
        // Cumulative-quarter split: chunk_i = round(target*(i+1)/4) - round(target*i/4).
        // Always positive, never exceeds the target, sums to exactly target for ANY size.
        var acc = 0;
        milestones = t.milestones.slice(0, 4).map(function (title, i) {
          var cum = Math.max(0, Math.round((target * ((i + 1) / 4)) * 100) / 100);
          var chunk = Math.max(0, Math.round((cum - acc) * 100) / 100);
          acc = cum;
          return { title: title, value: chunk };
        });
      }
      return { milestones: milestones, tasks: t.tasks.map(function (x) { return { title: x, estimateMinutes: 60 }; }), habits: t.habits };
    });
  }

  function projectProgress(projectId) {
    return Promise.all([col('milestones'), col('tasks')]).then(function (both) {
      var ms = both[0].filter(function (m) { return m.projectId === projectId; });
      var tasks = both[1].filter(function (t) { return t.projectId === projectId && t.archiveStatus === 'active'; });
      var tasksDone = tasks.filter(function (t) { return t.status === 'completed'; }).length;
      var milestonesDone = ms.filter(function (m) { return m.completed === true || m.completed === 1 || m.done === true; }).length;
      var taskPct = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;
      var milestonePct = ms.length ? Math.round((milestonesDone / ms.length) * 100) : 0;
      return {
        tasks: tasks.length,
        tasksDone: tasksDone,
        taskPct: taskPct,
        milestones: ms.length,
        milestonesDone: milestonesDone,
        milestonePct: milestonePct,
        overall: Math.round((milestonePct * 0.5 + taskPct * 0.5)),
        total: ms.length,
        done: milestonesDone,
        pct: milestonePct,
      };
    });
  }
  function routineById(routines, id) { for (var i = 0; i < routines.length; i++) if (routines[i].id === id) return routines[i]; return null; }

  function mapFocus(f) {
    var completed = f.completed === true || f.completed === 1 || f.complete === true;
    return {
      id: f.id,
      taskId: f.taskId || null,
      projectId: f.projectId || null,
      goalId: f.goalId || null,
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      plannedMinutes: f.plannedMinutes || 0,
      actualMinutes: f.actualMinutes != null ? Number(f.actualMinutes) : (Number(f.durationMinutes) || 0),
      completed: completed,
      abandoned: f.abandoned === true,
      mode: f.mode || 'focus',
      note: f.note || '',
      durationMinutes: Number(f.durationMinutes) || (f.actualMinutes != null ? Number(f.actualMinutes) : 0),
      distractionCount: f.distractionCount || 0,
      paused: f.paused === true,
      createdAt: f.createdAt,
    };
  }

  // =====================================================================
  // calendar / events
  // =====================================================================
  function eventToRow(input) {
    var now = nowIso();
    return {
      id: uid('event'),
      title: String(input.title || '').trim() || 'Event',
      description: input.description || '',
      start: input.start || null,
      end: input.end || null,
      allDay: !!input.allDay,
      type: input.type || 'event',
      color: input.color || '#8b5cf6',
      createdAt: now,
      updatedAt: now,
    };
  }
  function eventsInRange(start, end) {
    return Promise.all([col('events'), col('tasks')]).then(function (both) {
      var events = both[0];
      var tasks = both[1].filter(function (t) { return t.archiveStatus === 'active' && t.dueDate; });
      var out = events.map(function (e) {
        return { id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, type: e.type || 'event', color: e.color, description: e.description };
      });
      tasks.forEach(function (t) {
        out.push({ id: t.id, title: t.title, start: t.dueDate, end: t.dueDate, allDay: !t.dueTime, type: 'task', color: t.completedAt ? '#4ade80' : '#f59e0b', description: t.description });
      });
      if (start) out = out.filter(function (e) { return e.start && e.start >= start; });
      if (end) out = out.filter(function (e) { return e.start && e.start <= end; });
      out.sort(function (a, b) { return (a.start || '') < (b.start || '') ? -1 : 1; });
      return out;
    });
  }

  // =====================================================================
  // journal / mood / notes / inbox
  // =====================================================================
  function journalRows() {
    return col('journal').then(function (rows) {
      rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      return rows;
    });
  }

  // =====================================================================
  // analytics (light but valid subset of desktop shapes)
  // =====================================================================
  function isHabitScheduled(h, date) {
    if (!h) return false;
    var d = parseDate(date);
    switch (h.frequency) {
      case 'daily': return true;
      case 'weekdays': {
        var maskMap = /[0-6]/.test(h.weekdayMask || '');
        return maskMap ? (h.weekdayMask || '1111111')[d.getDay()] === '1' : d.getDay() !== 5 && d.getDay() !== 6;
      }
      case 'weekly': return true;
      case 'monthly': return true;
      default: return true;
    }
  }

  // Mirrors electron/engines/analytics.ts getDailyStats so both platforms return
  // the exact same shape: { date, tasks:{completed,missed,total,pct}, habits:{...},
  //   focusMinutes, goalProgress, completed, missed, total, pct }.
  function analyticsDaily(date) {
    date = date || todayStr();
    return Promise.all([col('tasks'), col('habitLog'), col('focus'), listHabits(false)]).then(function (both) {
      var tasks = both[0].filter(function (t) { return t.archiveStatus === 'active'; });
      var logs = both[1];
      var focus = both[2];
      var habits = both[3];
      var dayTasks = tasks.filter(function (t) {
        return t.dueDate === date || (t.plannedStart && dayOf(t.plannedStart) === date);
      });
      var tasksCompleted = dayTasks.filter(function (t) { return t.status === 'completed'; }).length;
      var tasksMissed = dayTasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled'; }).length;
      var tasksTotal = dayTasks.filter(function (t) { return t.status !== 'cancelled'; }).length;

      var logMap = {};
      for (var i = 0; i < logs.length; i++) if (logs[i].date === date) logMap[logs[i].habitId] = logs[i].status;
      var habitsScheduled = habits.filter(function (h) { return !h.archived && h.startDate <= date && (!h.endDate || h.endDate >= date) && isHabitScheduled(h, date); });
      var habitsCompleted = habitsScheduled.filter(function (h) { return logMap[h.id] === 'completed'; }).length;
      var habitsMissed = habitsScheduled.filter(function (h) { return logMap[h.id] === 'missed'; }).length;
      var habitsTotal = habitsScheduled.length;

      var focusMinutes = focus.reduce(function (s, f) {
        return f.completed === true && f.endedAt && f.startedAt && dayOf(f.startedAt) === date ? s + (Number(f.actualMinutes != null ? f.actualMinutes : f.durationMinutes) || 0) : s;
      }, 0);
      var distractionCount = focus.reduce(function (s, f) {
        return f.completed === true && f.startedAt && dayOf(f.startedAt) === date ? s + (Number(f.distractionCount) || 0) : s;
      }, 0);

      var completed = tasksCompleted + habitsCompleted;
      var total = tasksTotal + habitsTotal;
      var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        date: date,
        tasks: { completed: tasksCompleted, missed: tasksMissed, total: tasksTotal, pct: tasksTotal ? Math.round((tasksCompleted / tasksTotal) * 100) : 0 },
        habits: { completed: habitsCompleted, missed: habitsMissed, total: habitsTotal, pct: habitsTotal ? Math.round((habitsCompleted / habitsTotal) * 100) : 0 },
        focusMinutes: focusMinutes,
        goalProgress: null,
        completed: completed,
        missed: tasksMissed + habitsMissed,
        total: total,
        pct: pct,
        // legacy/compat keys (renderer no longer needs these, but keep minimal)
        totalTasks: tasksTotal,
        completedTasks: tasksCompleted,
        openTasks: dayTasks.length - tasksCompleted,
        tasksMissed: tasksMissed,
        habitsTotal: habitsTotal,
        habitsCompleted: habitsCompleted,
        habitsMissed: habitsMissed,
        distractionCount: distractionCount,
        productivityScore: pct,
        score: pct,
        closed: dayTasks.filter(function (t) { return t.status === 'completed'; }).map(function (t) { return { id: t.id, title: t.title, type: 'task' }; }),
        open: dayTasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled'; }).map(function (t) { return { id: t.id, title: t.title, type: 'task' }; }),
        skipped: [],
        completedHabits: habitsCompleted,
        topTags: {},
        breakdown: {},
      };
    });
  }

  // =====================================================================
  // prayer — ported verbatim from electron/engines/prayer.ts (pure math)
  // =====================================================================
  var RADp = Math.PI / 180;
  var DEGp = 180 / Math.PI;
  var PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var METHODS = {
    0: { fajr: 19.5, isha: 17.5 },
    1: { fajr: 15, isha: 15 },
    2: { fajr: 15, isha: 15 },
    3: { fajr: 18, isha: 17 },
    4: { fajr: 19.5, isha: 17 },
    5: { fajr: 19.5, isha: 17.5 },
    9: { fajr: 19.5, isha: 17.5, maghribMinutes: 90 },
    10: { fajr: 15, isha: 15 },
    11: { fajr: 18, isha: 18 },
    12: { fajr: 22, isha: 22 },
    16: { fajr: 18, isha: 18 },
    17: { fajr: 19, isha: 18 },
    18: { fajr: 20, isha: 18 },
  };
  var sin = function (d) { return Math.sin(d * RADp); };
  var cos = function (d) { return Math.cos(d * RADp); };
  var tan = function (d) { return Math.tan(d * RADp); };
  var asin = function (d) { return Math.asin(d) * DEGp; };
  var acos = function (d) { return Math.acos(d) * DEGp; };
  var fix = function (a, b) { return ((a % b) + b) % b; };
  function sunDeclAndEq(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = q + 1.915 * sin(g) + 0.02 * sin(2 * g);
    var e = 23.439 - 0.00000036 * D;
    var RA = fix(Math.atan2(cos(e) * sin(L), cos(L)) * DEGp, 360);
    var decl = asin(sin(e) * sin(L));
    var equation = (q / 15) - (RA / 15);
    return { decl: decl, equation: equation };
  }
  function methodFor(id) { return METHODS[id] || METHODS[4]; }
  function timezoneOffsetHours() {
    var n = new Date();
    var asUTC = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    var local = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return (asUTC - local.getTime()) / 3.6e6;
  }
  function prayerTimesForDate(date, lat, lng, tzOffsetHours, methodId, madhab, adjustmentMinutes) {
    var parts = date.split('-').map(Number);
    var Y = parts[0], M = parts[1], D = parts[2];
    var jd = Date.UTC(Y, M - 1, D) / 86400000 + 2440587.5;
    var e0 = sunDeclAndEq(jd);
    var solarNoon = 12 - (lng / 15) - e0.equation;
    var sd = sunDeclAndEq(jd + 0.5);
    var decl = sd.decl;
    var cosDecl = cos(decl);
    var cosLat = cos(lat);
    function hourAngle(angle) {
      var cosH = (sin(angle) - sin(lat) * sin(decl)) / (cosLat * cosDecl);
      if (cosH > 1 || cosH < -1) return null;
      return acos(cosH);
    }
    function toMinutes(fractionalFraction) {
      if (fractionalFraction == null) return '--:--';
      var local = fractionalFraction + tzOffsetHours + adjustmentMinutes / 60;
      var h = Math.floor(((local % 24) + 24) % 24);
      var m = Math.floor(((((local + 24) % 24) - h + 24) % 24 || 0) * 60);
      return PAD(h) + ':' + PAD(m);
    }
    var method = methodFor(methodId);
    var sunriseHA = hourAngle(0.833);
    var asrFactor = madhab === 1 ? 2 : 1;
    var asrHA = hourAngle(Math.atan(1 / (asrFactor + tan(Math.abs(lat - decl)))) * DEGp);
    var fajrHA = hourAngle(-method.fajr);
    var ishaHA = method.isha > 0 && method.isha < 30 ? hourAngle(-method.isha) : null;
    var noonUTC = 12 - (lng / 15) - e0.equation;
    var fajrUTC = fajrHA != null ? noonUTC - fajrHA / 15 : null;
    var sunriseUTC = sunriseHA != null ? noonUTC - sunriseHA / 15 : null;
    var dhuhrUTC = noonUTC;
    var asrUTC = asrHA != null ? noonUTC + asrHA / 15 : null;
    var maghribUTC = null;
    if (method.maghribMinutes != null) {
      maghribUTC = (sunriseUTC != null ? sunriseUTC : noonUTC) + method.maghribMinutes / 60;
    } else {
      var mHA = hourAngle(0.833);
      maghribUTC = mHA != null ? noonUTC + mHA / 15 : null;
    }
    var ishaUTC = null;
    if (method.isha >= 30) {
      ishaUTC = (maghribUTC != null ? maghribUTC : noonUTC) + method.isha / 60;
    } else {
      ishaUTC = ishaHA != null ? noonUTC + ishaHA / 15 : null;
    }
    var sunsetHA = hourAngle(0.833);
    var sunsetUTC = sunsetHA != null ? noonUTC + sunsetHA / 15 : maghribUTC;
    return {
      fajr: toMinutes(fajrUTC),
      dhuhr: toMinutes(dhuhrUTC + 4 / 60),
      asr: toMinutes(asrUTC),
      maghrib: toMinutes(maghribUTC),
      isha: toMinutes(ishaUTC),
      sunrise: toMinutes(sunriseUTC),
      sunset: toMinutes(sunsetUTC),
    };
  }
  function defaultPrayerSettings() {
    return {
      country: 'SA',
      city: 'Mecca',
      method: 4,
      madhab: 0,
      adjustment: 0,
      enabled: 1,
      trackingEnabled: 1,
      gamificationEnabled: 0,
      remindBefore: 15,
      latitude: 21.4225,
      longitude: 39.8262,
      timezone: 'Asia/Riyadh',
      lastFetchedAt: null,
    };
  }
  function getPrayerSettings() { return getObj('prayerSettings', defaultPrayerSettings()); }
  function savePrayerSettings(patch) {
    return getPrayerSettings().then(function (s) {
      var merged = merge(s, patch);
      return setObj('prayerSettings', merged).then(function () { emitDataChanged(); return merged; });
    });
  }
  function prayerDaily(date) {
    date = date || todayStr();
    return getPrayerSettings().then(function (s) {
      var c = prayerTimesForDate(date, Number(s.latitude), Number(s.longitude), timezoneOffsetHours(), Number(s.method), Number(s.madhab), Number(s.adjustment));
      return { date: date, times: { fajr: c.fajr, dhuhr: c.dhuhr, asr: c.asr, maghrib: c.maghrib, isha: c.isha }, settings: s, sunrise: c.sunrise, sunset: c.sunset };
    });
  }
  function prayerWeek() {
    return getPrayerSettings().then(function () {
      var result = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date();
        d.setDate(d.getDate() + i);
        var iso = toDateStr(d);
        result.push({ date: iso, times: null });
      }
      var chain = Promise.resolve();
      result.forEach(function (entry) {
        chain = chain.then(function () { return prayerDaily(entry.date).then(function (dd) { entry.times = dd.times; }); });
      });
      return chain.then(function () { return result; });
    });
  }
  function prayerNext() {
    return prayerDaily(todayStr()).then(function (dd) {
      var n = new Date();
      var curSeconds = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
      for (var i = 0; i < PRAYER_ORDER.length; i++) {
        var p = PRAYER_ORDER[i];
        var parts = String(dd.times[p]).split(':').map(Number);
        if (isNaN(parts[0])) continue;
        var sec = parts[0] * 3600 + parts[1] * 60;
        if (sec > curSeconds) return { name: p, time: dd.times[p], inSeconds: sec - curSeconds, times: dd.times };
      }
      var tomorrow = new Date(n);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return prayerDaily(toDateStr(tomorrow)).then(function (td) {
        var parts = String(td.times.fajr).split(':').map(Number);
        var sec = parts[0] * 3600 + parts[1] * 60;
        return { name: 'fajr', time: td.times.fajr, inSeconds: (24 * 3600 - curSeconds) + sec, times: td.times };
      });
    });
  }
  function prayerLogFor(date) {
    date = date || todayStr();
    return col('prayerLog').then(function (rows) {
      var m = { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false };
      rows.forEach(function (r) { if (r.date === date && m[r.prayer] !== undefined) m[r.prayer] = !!r.completed; });
      return m;
    });
  }
  function togglePrayerLog(prayer, date) {
    date = date || todayStr();
    return col('prayerLog').then(function (rows) {
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].prayer === prayer && rows[i].date === date) idx = i;
      if (idx !== -1) rows.splice(idx, 1);
      else rows.push({ id: uid('pray'), prayer: prayer, date: date, completed: 1, createdAt: nowIso(), updatedAt: nowIso() });
      return saveCol('prayerLog', rows);
    }).then(function () { emitDataChanged(); return true; });
  }
  function prayerStats(days) {
    days = Number(days) || 30;
    var start = addDays(todayStr(), -days);
    return col('prayerLog').then(function (rows) {
      var mine = rows.filter(function (r) { return r.date >= start; });
      var counts = {};
      PRAYER_ORDER.forEach(function (p) { counts[p] = { completed: 0, total: 0 }; });
      mine.forEach(function (r) { if (counts[r.prayer]) { counts[r.prayer].total++; if (r.completed) counts[r.prayer].completed++; } });
      var completed = mine.filter(function (r) { return r.completed; }).length;
      var total = mine.length;
      return { counts: counts, completed: completed, total: total, rate: total ? Math.round((completed / total) * 100) : 0 };
    });
  }

  // =====================================================================
  // Capacitor helpers + Local Notifications engine
  // =====================================================================
  function cap() { return global.Capacitor || null; }
  function plugin(name) {
    var c = cap();
    return c && c.Plugins && c.Plugins[name] ? c.Plugins[name] : null;
  }
  function isNative() {
    var c = cap();
    return !!(c && (c.isNativePlatform ? c.isNativePlatform() : false));
  }

  var permState = null;
  function ensurePerm() {
    var ln = plugin('LocalNotifications');
    if (!ln) return Promise.resolve(false);
    return ln.checkPermissions().then(function (st) {
      var s = st && st.display;
      if (s === 'granted') { permState = true; return true; }
      if (s === 'denied') { permState = false; return false; }
      return ln.requestPermissions().then(function (r) {
        var g = !!(r && r.display === 'granted');
        permState = g;
        return g;
      });
    }).catch(function () { return false; });
  }

  function SMART_BRAND() {
    return 'SMART Planner';
  }

  function ensureChannel() {
    var ln = plugin('LocalNotifications');
    var c = cap();
    if (!ln || !c || !c.isNativePlatform) return Promise.resolve();
    if (!c.isNativePlatform() || typeof ln.createChannel !== 'function') return Promise.resolve();
    return ln.createChannel({
      id: 'task-alerts',
      name: SMART_BRAND() + ' Tasks',
      description: 'Task reminders and alarms',
      sound: 'alarm.wav',
      importance: 5,
      visibility: 1,
      lights: true,
      lightColor: '#7c3aed',
      vibration: true,
    }).catch(function () { /* channel may already exist */ });
  }

  function getManifest() { return getObj('scheduledManifest', []); }
  function setManifest(ids) { return setObj('scheduledManifest', ids); }

  function reminderBody(task, occurrence) {
    var when = task.dueTime ? task.dueTime : '';
    if (task.recurrence && task.recurrence !== 'none' && occurrence) {
      return 'Reminder — ' + occurrence + (when ? ' at ' + when : '');
    }
    return task.dueTime ? 'Task due at ' + task.dueTime : 'Task reminder';
  }

  function taskBody(task, occurrence) {
    return reminderBody(task, occurrence);
  }

  function computeReminderAt(task, occurrenceDate, reminderBeforeMinutes) {
    var minutes = 0;
    if (task.dueTime) minutes = timeToMinutes(task.dueTime) - Number(reminderBeforeMinutes) || 0;
    else if (task.reminderAt) minutes = timeToMinutes(task.reminderAt);
    minutes = clamp(minutes, 0, 1439);
    var d = parseDate(occurrenceDate);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d;
  }

  function nextRecurrenceDate(base, rule, index) {
    switch (rule) {
      case 'daily': return addDays(base, index);
      case 'weekly': return addDays(base, index * 7);
      case 'monthly': return addMonths(base, index);
      case 'quarterly': return addMonths(base, index * 3);
      case 'yearly': return addMonths(base, index * 12);
      default: return null;
    }
  }

  function taskOccurrences(task, today, windowDays) {
    windowDays = windowDays || 90;
    if (!task.dueDate) return [];
    if (task.recurrence === 'none' || task.recurrence === 'custom') {
      return task.dueDate >= today ? [task.dueDate] : [];
    }
    var base = task.dueDate;
    var end = task.recurrenceEnd && task.recurrenceEnd >= base ? task.recurrenceEnd : addDays(today, windowDays);
    var out = [];
    var i = 1;
    while (i < 500) {
      var d = nextRecurrenceDate(base, task.recurrence, i);
      if (!d || d > end) break;
      if (d >= today) out.push(d);
      i++;
    }
    return out;
  }

  function syncManifest(desired) {
    var ln = plugin('LocalNotifications');
    if (!ln) return Promise.resolve();
    return getManifest().then(function (prev) {
      var prevMap = {};
      (prev || []).forEach(function (p) {
        var id = typeof p === 'object' && p !== null ? p.id : p;
        prevMap[id] = (typeof p === 'object' && p !== null && p.key !== undefined) ? p.key : null;
      });
      var toCancel = [];
      var toAdd = [];
      var nextManifest = [];
      desired.forEach(function (d) {
        var at = d.schedule && d.schedule.at ? d.schedule.at.getTime() : null;
        var key = at != null
          ? 'at' + at
          : ('on' + (d.schedule && d.schedule.on ? ((d.schedule.on.hour || 0) + ':' + (d.schedule.on.minute || 0)) : '') + (d.schedule && d.schedule.repeats ? ':r' : ''));
        nextManifest.push({ id: d.id, key: key });
        if (!(d.id in prevMap)) {
          toAdd.push(d);
        } else if (prevMap[d.id] !== key) {
          toCancel.push({ id: d.id });
          toAdd.push(d);
        }
      });
      (prev || []).forEach(function (p) {
        var id = typeof p === 'object' && p !== null ? p.id : p;
        if (!desired.some(function (d) { return d.id === id; })) toCancel.push({ id: id });
      });
      var chain = Promise.resolve();
      if (toCancel.length) {
        chain = chain.then(function () {
          return ln.cancel({ notifications: toCancel }).catch(function () { return null; });
        });
      }
      if (toAdd.length) {
        chain = chain.then(function () {
          return ln.schedule({ notifications: toAdd }).catch(function () { return null; });
        });
      }
      return chain.then(function () { return setManifest(nextManifest); });
    });
  }

  function cancelAllScheduled() {
    var ln = plugin('LocalNotifications');
    if (!ln) return Promise.resolve();
    return getManifest().then(function (prev) {
      var ids = (prev || []).map(function (p) { return (typeof p === 'object' && p !== null) ? p.id : p; });
      if (!ids.length) return null;
      return ln.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }).catch(function () { return null; }).then(function () { return setManifest([]); });
    });
  }

  var resyncTimer = null;
  function scheduleResync() {
    if (resyncTimer) clearTimeout(resyncTimer);
    resyncTimer = setTimeout(function () { resyncTimer = null; resyncSchedules(); }, 250);
  }

  function resyncSchedules() {
    var ln = plugin('LocalNotifications');
    if (!ln) return Promise.resolve(false);
    return Promise.all([getSettings(), getUserObj()]).then(function (vals) {
      var settings = vals[0];
      var user = vals[1];
      if (!settings.notificationsEnabled) return cancelAllScheduled();
      return ensurePerm().then(function (granted) {
        if (!granted) return false;
        return ensureChannel().then(function () {
          return col('tasks').then(function (tasks) {
            var today = todayStr();
            var reminderBefore = settings.reminderBeforeMinutes != null ? Number(settings.reminderBeforeMinutes) : 15;
            var nowMillis = Date.now();
            var desired = [];
            var seen = {};
            tasks.forEach(function (t) {
              if (!t.dueDate || t.archiveStatus !== 'active' || t.status === 'completed' || t.status === 'cancelled') return;
              taskOccurrences(t, today, 90).forEach(function (occ) {
                var at = computeReminderAt(t, occ, reminderBefore);
                if (at.getTime() > nowMillis) {
                  var id = notifId('task:' + t.id + ':' + occ);
                  if (seen['s' + id]) return;
                  seen['s' + id] = 1;
                  desired.push({
                    id: id,
                    title: t.title,
                    body: taskBody(t, occ),
                    schedule: { at: at, allowWhileIdle: true },
                    channelId: 'task-alerts',
                    sound: 'alarm.wav',
                    foreground: true,
                    autoCancel: false,
                    extra: { kind: 'task', entityId: t.id, targetDate: occ, page: 'tasks' },
                  });
                } else {
                  insertIfNew('task', t.id, occ, t.title, taskBody(t, occ), 'task', 'tasks');
                }
                // On-time alarm at the exact due time (only when a due time exists
                // and it is not the same instant as the reminder).
                if (t.dueTime) {
                  var dueAt = parseDate(occ);
                  var dm = timeToMinutes(t.dueTime);
                  dueAt.setHours(Math.floor(dm / 60), dm % 60, 0, 0);
                  if (dueAt.getTime() > nowMillis) {
                    var dueId = notifId('task:' + t.id + ':' + occ + ':due');
                    if (seen['d' + dueId]) return;
                    seen['d' + dueId] = 1;
                    desired.push({
                      id: dueId,
                      title: t.title,
                      body: 'Task due now — ' + t.title + (t.dueTime ? ' at ' + t.dueTime : ''),
                      schedule: { at: dueAt, allowWhileIdle: true },
                      channelId: 'task-alerts',
                      sound: 'alarm.wav',
                      foreground: true,
                      autoCancel: false,
                      extra: { kind: 'task', entityId: t.id, targetDate: occ, page: 'tasks' },
                    });
                  }
                }
              });
            });
            // daily summary (id 900001) with repeating time schedule
            var summaryHour = 6, summaryMin = 0;
            if (user.wakeTime && /^\d{1,2}:\d{2}$/.test(String(user.wakeTime))) {
              var sp = String(user.wakeTime).split(':');
              summaryHour = Number(sp[0]) || 6;
              summaryMin = Number(sp[1]) || 0;
            }
            desired.push({
              id: 900001,
              title: 'Daily Summary',
              body: 'Review your day with ' + SMART_BRAND(),
              schedule: { on: { hour: summaryHour, minute: summaryMin }, repeats: true },
              channelId: 'task-alerts',
              sound: 'alarm.wav',
              foreground: false,
              autoCancel: false,
              extra: { kind: 'summary' },
            });
            return getPrayerSettings().then(function (ps) {
              if (Number(ps.enabled) !== 1) return syncManifest(desired);
              var remindP = Number(ps.remindBefore) >= 0 ? Number(ps.remindBefore) : 15;
              return prayerDaily(today).then(function (todayTimes) {
                return prayerDaily(addDays(today, 1)).then(function (tomorrowTimes) {
                  var days = [todayTimes, tomorrowTimes];
                  for (var di = 0; di < days.length; di++) {
                    var dd = days[di];
                    var due = parseDate(dd.date);
                    for (var pi = 0; pi < PRAYER_ORDER.length; pi++) {
                      var p = PRAYER_ORDER[pi];
                      var pt = dd.times[p];
                      if (!pt || pt === '--:--') continue;
                      var pm = timeToMinutes(pt) - remindP;
                      if (pm < 0) continue;
                      var at = parseDate(dd.date);
                      at.setHours(Math.floor(pm / 60), pm % 60, 0, 0);
                      if (at.getTime() <= nowMillis) continue;
                      var prayerId = notifId('prayer:' + p + ':' + dd.date);
                      if (seen['p' + prayerId]) continue;
                      seen['p' + prayerId] = 1;
                      desired.push({
                        id: prayerId,
                        title: 'Prayer time',
                        body: (p.charAt(0).toUpperCase() + p.slice(1)) + ' at ' + pt,
                        schedule: { at: at, allowWhileIdle: true },
                        channelId: 'task-alerts',
                        sound: 'alarm.wav',
                        foreground: true,
                        autoCancel: false,
                        extra: { kind: 'prayer', entityId: 'prayer-' + p, targetDate: dd.date, page: 'prayer' },
                      });
                    }
                  }
                  return syncManifest(desired);
                });
              });
            });
          });
        });
      });
    }).catch(function (e) { /* background errors are non-fatal */ return false; });
  }

  function testNotification() {
    var ln = plugin('LocalNotifications');
    var n = {
      id: uid('tn'),
      at: nowIso(),
      title: 'Test notification',
      body: 'Notification system works!',
      type: 'info',
      read: false,
      readAt: null,
      dismissedAt: null,
      resolvedAt: null,
    };
    return addNotificationRow(n).then(function () {
      emit('notification', { title: n.title, body: n.body });
      emitDataChanged();
      if (ln && isNative()) {
        return ensurePerm().then(function (g) {
          if (!g) return n;
          return ensureChannel().then(function () {
            return ln.schedule({
              notifications: [{
                id: 900002,
                title: 'Test notification',
                body: 'Notification system works!',
                schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
                channelId: 'task-alerts',
                sound: 'alarm.wav',
                foreground: true,
              }],
            }).catch(function () { return null; }).then(function () { return n; });
          });
        });
      }
      return n;
    });
  }

  // Capacitor 4-6 resolved the listener handle through a Promise; 7+ return it
  // synchronously. Chaining `.catch()` onto the sync form threw a TypeError at
  // boot and took the whole app down, so detect the shape instead of assuming it.
  function onPluginEvent(pluginName, eventName, handler) {
    var p = plugin(pluginName);
    if (!p || typeof p.addListener !== 'function') return;
    try {
      var h = p.addListener(eventName, handler);
      if (h && typeof h.then === 'function') h.then(null, function () {});
    } catch (e) { /* plugin unavailable on this platform — ignore */ }
  }

  function registerNativeListeners() {
    onPluginEvent('LocalNotifications', 'localNotificationReceived', function (n) {
      if (n && n.extra && n.extra.kind === 'task' && n.extra.entityId) {
        insertIfNew('task', n.extra.entityId, n.extra.targetDate || todayStr(), n.title || 'Task reminder', n.body || '', 'task', 'tasks')
          .then(function () { emit('notification', { title: n.title || '', body: n.body || '' }); emitDataChanged(); });
      } else if (n && n.extra && n.extra.kind === 'prayer' && n.extra.entityId) {
        insertIfNew('prayer', n.extra.entityId, n.extra.targetDate || todayStr(), n.title || 'Prayer time', n.body || '', 'prayer', 'prayer')
          .then(function () { emit('notification', { title: n.title || '', body: n.body || '' }); emitDataChanged(); });
      } else {
        emit('notification', { title: n.title || '', body: n.body || '' });
      }
    });
    onPluginEvent('App', 'appStateChange', function (s) {
      if (s && s.isActive) { resyncSchedules(); }
    });
  }

  function openTelegram() {
    var br = plugin('Browser');
    if (br && typeof br.open === 'function' && isNative()) {
      return br.open({ url: 'https://t.me/Kilwa_050' }).catch(function () {
        if (global.open) global.open('https://t.me/Kilwa_050', '_blank');
      });
    }
    if (global.open) global.open('https://t.me/Kilwa_050', '_blank');
    return Promise.resolve({ opened: true });
  }

  // =====================================================================
  // handlers
  // =====================================================================
  var handlers = {
    'app:health': function () {
      return Promise.all([col('tasks'), col('habits'), col('notifications')]).then(function (both) {
        return { version: 1, status: 'ok', dbSize: 0, taskCount: both[0].length, habitCount: both[1].length, notificationCount: both[2].length };
      });
    },

    'settings:get': function () { return getSettings(); },
    'settings:update': function (patch) {
      return getSettings().then(function (s) {
        var merged = merge(s, patch || {});
        merged.updatedAt = nowIso();
        return saveSettings(merged).then(function () { scheduleResync(); return merged; });
      });
    },
    'user:get': function () { return getUserObj(); },
    'user:update': function (patch) {
      return getUserObj().then(function (u) {
        var merged = merge(u, patch || {});
        merged.updatedAt = nowIso();
        return saveUser(merged).then(function () { scheduleResync(); return merged; });
      });
    },
    'onboarding:status': function () { return getObj('onboarded', false).then(function (v) { return !v; }); },
    'onboarding:complete': function (data) {
      data = data || {};
      return getUserObj().then(function (u) {
        var merged = merge(u, data.user || data);
        merged.name = merged.name || 'Ahmed';
        merged.language = merged.language || 'en';
        merged.updatedAt = nowIso();
        return saveUser(merged).then(function () { return setObj('onboarded', true); });
      }).then(function () {
        emitDataChanged();
        scheduleResync();
        return { ok: true };
      });
    },
    'demo:load': function () { return { seeded: false }; },
    'data:deleteAll': function () {
      return idbClear().then(function () { dbPromise = null; emitDataChanged(); return { cleared: true }; });
    },
    'templates:list': function () { return []; },
    'templates:apply': function () { return null; },
    'contact:telegram': function () { return openTelegram(); },

    // tasks
    'tasks:list': function (incl) { return listTasks(!!incl); },
    'tasks:get': function (id) { return getTask(id); },
    'tasks:create': function (input) { return createTask(input || {}); },
    'tasks:update': function (id, patch) { return updateTask(id, patch || {}); },
    'tasks:toggle': function (id) { return toggleTask(id); },
    'tasks:delete': function (id, permanent) { return deleteTask(id, !!permanent); },
    'tasks:archive': function (id) { return archiveTask(id); },
    'tasks:restore': function (id) { return restoreTask(id); },
    'tasks:subtasks': function (taskId) { return listSubtasks(taskId); },
    'tasks:subtaskAdd': function (taskId, title) { return addSubtask(taskId, title); },
    'tasks:subtaskToggle': function (id) { return toggleSubtask(id); },
    'tasks:subtaskDelete': function (id) { return deleteSubtask(id); },
    'tasks:history': function (id) { return taskHistory(id); },
    'tasks:quickCapture': function (title, extra) {
      var parsed = quickCaptureParse(title, extra || {});
      return createTask(parsed).then(function (t) {
        return addTaskHistory(t.id, 'created', t.title).then(function () { return t; });
      });
    },
    'tasks:parse': function (title, extra) { return quickCaptureParse(title, extra || {}); },
    'tasks:schedule': function (id, start, end) { return scheduleTask(id, start, end); },
    'tasks:reschedule': function (id, dueDate, dueTime) { return rescheduleTask(id, dueDate, dueTime); },
    'tasks:today': function () { return todayTasksList(); },
    'tasks:overdue': function () { return overdueTasksList(); },
    'tasks:upcoming': function (days) { return upcomingTasksList(days); },

    // habits
    'habits:list': function (incl) { return listHabits(!!incl); },
    'habits:get': function (id) { return getHabit(id); },
    'habits:create': function (input) {
      var h = merge(defaultHabit(), input || {});
      if ((input && input.type) === 'bool' || h.type === 'bool') h.type = 'binary';
      h.name = String(h.name || '').trim() || 'New habit';
      h.id = uid('habit');
      return saveEntity('habits', h).then(function () { emitDataChanged(); return h; });
    },
    'habits:update': function (id, patch) {
      return getHabit(id).then(function (h) {
        if (!h) return null;
        var prevGoal = h.goalId;
        h = merge(h, patch || {});
        if (h.type === 'bool') h.type = 'binary';
        h.updatedAt = nowIso();
        return saveEntity('habits', h).then(function () {
          emitDataChanged();
          var goal = h.goalId || prevGoal;
          return goal ? recomputeGoalProgress(goal).then(function () { return h; }) : h;
        });
      });
    },
    'habits:delete': function (id) {
      var linked = null;
      return getHabit(id).then(function (h) {
        linked = h && h.goalId ? h.goalId : null;
        return deleteEntity('habits', id);
      }).then(function () {
        emitDataChanged();
        return linked ? recomputeGoalProgress(linked).then(function () { return true; }) : true;
      });
    },
    'habits:log': function (id, date, status, value) { return setHabitLog(id, date, status, value); },
    'habits:toggle': function (id, date) { return toggleHabit(id, date); },
    'habits:stats': function (id) { return habitStats(id); },
    'habits:strength': function (id) { return habitStrength(id); },
    'habits:monthMatrix': function (year, month) { return monthMatrix(year, month); },
    'habits:weekRows': function (weekStartsOn) { return weekRows(weekStartsOn); },
    'habits:freeze': function (id, date) { return freezeStreak(id, date); },
    'habits:unfreeze': function (id, date) { return unfreezeStreak(id, date); },

    // goals
    'goals:list': function (incl) { return listEntities('goals', !!incl); },
    'goals:get': function (id) { return getEntity('goals', id); },
    'goals:create': function (input) {
      var g = createEntity('goal', input);
      return saveEntity('goals', g).then(function () {
        emitDataChanged();
        return recomputeGoalProgress(g.id).then(function () { return getEntity('goals', g.id); });
      });
    },
    'goals:update': function (id, patch) {
      return getEntity('goals', id).then(function (g) {
        if (!g) return null;
        var m = merge(g, patch || {});
        m.updatedAt = nowIso();
        return saveEntity('goals', m).then(function () {
          emitDataChanged();
          return recomputeGoalProgress(id).then(function () { return getEntity('goals', id); });
        });
      });
    },
    'goals:delete': function (id) { return deleteEntity('goals', id).then(function () { emitDataChanged(); return true; }); },
    'goals:archive': function (id) { return this['goals:update'](id, { archived: true }); },
    'goals:steps': function (id) {
      return col('goalSteps').then(function (rows) { return rows.filter(function (s) { return s.goalId === id; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); });
    },
    'goals:addStep': function (goalId, title, opts) {
      opts = opts || {};
      var value = Number(opts.value) > 0 ? Number(opts.value) : 1;
      var countsTowardProgress = opts.countsTowardProgress === false ? 0 : 1;
      var s = { id: uid('step'), goalId: goalId, title: String(title || '').trim(), notes: '', completed: false, status: 'pending', order: 0, value: value, countsTowardProgress: countsTowardProgress, createdAt: nowIso(), updatedAt: nowIso() };
      return col('goalSteps').then(function (rows) { rows.push(s); return saveCol('goalSteps', rows); })
        .then(function () { emitDataChanged(); return recomputeGoalProgress(goalId); }).then(function () { return s; });
    },
    'goals:updateStep': function (stepId, patch) {
      return col('goalSteps').then(function (rows) {
        var found = null;
        rows = rows.map(function (s) {
          if (s.id === stepId) {
            s = merge(s, patch || {});
            s.completed = !!(patch && patch.completed !== undefined ? patch.completed : s.completed);
            s.status = patch && patch.status !== undefined ? patch.status : (s.completed ? 'done' : 'pending');
            s.updatedAt = nowIso();
            found = s;
          }
          return s;
        });
        return saveCol('goalSteps', rows).then(function () { return found; });
      }).then(function (s) { if (s) { emitDataChanged(); return recomputeGoalProgress(s.goalId); } return null; }).then(function (p) { return p; });
    },
    'goals:toggleStep': function (stepId) {
      var goalId = null;
      return col('goalSteps').then(function (rows) {
        var found = null;
        rows = rows.map(function (s) {
          if (s.id === stepId) {
            s.completed = !(s.completed === true || s.completed === 1 || s.status === 'done');
            s.status = s.completed ? 'done' : 'pending';
            s.updatedAt = nowIso();
            goalId = s.goalId;
            found = s;
          }
          return s;
        });
        return saveCol('goalSteps', rows).then(function () { return found; });
      }).then(function (s) { if (s) { emitDataChanged(); return recomputeGoalProgress(goalId); } return null; }).then(function (p) { return p; });
    },
    'goals:deleteStep': function (stepId) {
      var goalId = null;
      return col('goalSteps').then(function (rows) {
        rows = rows.filter(function (s) { if (s.id === stepId && s.goalId) goalId = s.goalId; return s.id !== stepId; });
        return saveCol('goalSteps', rows);
      }).then(function () { emitDataChanged(); return recomputeGoalProgress(goalId); });
    },
    'goals:progress': function (id) { return goalProgress(id); },
    'goals:smart': function (id) { return goalSmartStats(id); },
    'goals:suggest': function (id) { return suggestSmartStepsShim(id); },

    // projects
    'projects:list': function (incl) { return listEntities('projects', !!incl); },
    'projects:get': function (id) { return getEntity('projects', id); },
    'projects:create': function (input) {
      var p = createEntity('project', input);
      return saveEntity('projects', p).then(function () { emitDataChanged(); return p; });
    },
    'projects:update': function (id, patch) {
      return getEntity('projects', id).then(function (p) { if (!p) return null; var m = merge(p, patch || {}); m.updatedAt = nowIso(); return saveEntity('projects', m).then(function () { emitDataChanged(); return m; }); });
    },
    'projects:delete': function (id) { return deleteEntity('projects', id).then(function () { emitDataChanged(); return true; }); },
    'projects:archive': function (id) { return this['projects:update'](id, { archived: true }); },
    'projects:milestones': function (id) {
      return col('milestones').then(function (rows) {
        return rows.filter(function (m) { return m.projectId === id; }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }).map(function (m) {
          return { id: m.id, projectId: m.projectId, title: m.title, completed: !!(m.completed === true || m.completed === 1 || m.done === true), dueDate: m.dueDate || null, goalId: m.goalId || null, sort: m.sort || 0, createdAt: m.createdAt };
        });
      });
    },
    'projects:addMilestone': function (id, title) {
      var m = { id: uid('ms'), projectId: id, title: String(title || '').trim(), completed: false, dueDate: null, goalId: null, sort: 0, createdAt: nowIso() };
      return col('milestones').then(function (rows) {
        m.sort = rows.filter(function (x) { return x.projectId === id; }).length;
        rows.push(m);
        return saveCol('milestones', rows);
      }).then(function () { emitDataChanged(); return m; });
    },
    'projects:toggleMilestone': function (id) {
      return col('milestones').then(function (rows) {
        var found = null;
        rows = rows.map(function (m) {
          if (m.id === id) {
            var val = !(m.completed === true || m.completed === 1 || m.done === true);
            m.completed = val;
            m.done = val;
            found = m;
          }
          return m;
        });
        return saveCol('milestones', rows).then(function () { return found; });
      }).then(function (m) {
        if (m) {
          emitDataChanged();
          return { id: m.id, projectId: m.projectId, title: m.title, completed: !!(m.completed === true || m.completed === 1 || m.done === true), dueDate: m.dueDate || null, goalId: m.goalId || null, sort: m.sort || 0, createdAt: m.createdAt };
        }
        return null;
      });
    },
    'projects:progress': function (id) { return projectProgress(id); },

    // routines
    'routines:list': function () { return listEntities('routines', false); },
    'routines:get': function (id) { return getEntity('routines', id); },
    'routines:create': function (input) {
      input = input || {};
      var r = createEntity('routine', input);
      r.durationMinutes = input.durationMinutes || 0;
      r.encouragements = input.encouragements || {};
      r.timeOfDay = input.timeOfDay || (r.timeOfDay || '07:00');
      r.isActive = input.isActive !== undefined ? !!input.isActive : true;
      return saveEntity('routines', r).then(function () { emitDataChanged(); return r; });
    },
    'routines:update': function (id, patch) {
      return getEntity('routines', id).then(function (r) { if (!r) return null; var m = merge(r, patch || {}); m.updatedAt = nowIso(); return saveEntity('routines', m).then(function () { emitDataChanged(); return m; }); });
    },
    'routines:delete': function (id) { return deleteEntity('routines', id).then(function () { emitDataChanged(); return true; }); },
    'routines:steps': function (id) {
      return col('routineSteps').then(function (rows) { return rows.filter(function (s) { return s.routineId === id; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); });
    },
    'routines:addStep': function (id, title, dur) {
      var s = { id: uid('rstep'), routineId: id, title: String(title || '').trim(), duration: Number(dur) || 20, order: 0, createdAt: nowIso() };
      return col('routineSteps').then(function (rows) { rows.push(s); return saveCol('routineSteps', rows); }).then(function () { emitDataChanged(); return s; });
    },
    'routines:updateStep': function (id, patch) {
      return col('routineSteps').then(function (rows) {
        var found = null;
        rows = rows.map(function (s) { if (s.id === id) { s = merge(s, patch || {}); found = s; } return s; });
        return saveCol('routineSteps', rows).then(function () { return found; });
      }).then(function (s) { if (s) emitDataChanged(); return s; });
    },
    'routines:deleteStep': function (id) {
      return col('routineSteps').then(function (rows) {
        rows = rows.filter(function (s) { return s.id !== id; });
        return saveCol('routineSteps', rows);
      }).then(function () { emitDataChanged(); return true; });
    },
    'routines:log': function (id, date, completed, cs, ts) {
      return col('routineLogs').then(function (rows) {
        var idx = -1;
        var totalSteps = Number(ts) >= 0 ? Number(ts) : 1;
        var completedSteps = Number(cs) >= 0 ? Number(cs) : 0;
        for (var i = 0; i < rows.length; i++) if (rows[i].routineId === id && rows[i].date === date) idx = i;
        if (idx >= 0) {
          rows[idx].completed = !!completed;
          rows[idx].completedSteps = completedSteps;
          rows[idx].totalSteps = totalSteps;
          var l = rows[idx];
          return saveCol('routineLogs', rows).then(function () { emitDataChanged(); return l; });
        }
        var nl = { id: uid('rlog'), routineId: id, date: date, completed: !!completed, completedSteps: completedSteps, totalSteps: totalSteps, createdAt: nowIso() };
        rows.push(nl);
        return saveCol('routineLogs', rows).then(function () { emitDataChanged(); return nl; });
      });
    },
    'routines:logs': function (id) {
      return col('routineLogs').then(function (rows) {
        return rows.filter(function (l) { return l.routineId === id; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (l) {
          return { id: l.id, routineId: l.routineId, date: l.date, completed: !!(l.completed === true || l.completed === 1), completedSteps: l.completedSteps != null ? Number(l.completedSteps) : (l.cs != null ? Number(l.cs) : 0), totalSteps: l.totalSteps != null ? Number(l.totalSteps) : (l.ts != null ? Number(l.ts) : (l.completedSteps != null ? Number(l.completedSteps) : 1)), createdAt: l.createdAt };
        });
      });
    },

    // calendar
    'calendar:events': function (start, end) { return eventsInRange(start || '', end || ''); },
    'calendar:create': function (input) {
      var e = eventToRow(input || {});
      return col('events').then(function (rows) { rows.push(e); return saveCol('events', rows); }).then(function () { emitDataChanged(); return e; });
    },
    'calendar:update': function (id, patch) {
      return col('events').then(function (rows) {
        var found = null;
        rows = rows.map(function (e) { if (e.id === id) { e = merge(e, patch || {}); e.updatedAt = nowIso(); found = e; } return e; });
        return saveCol('events', rows).then(function () { return found; });
      }).then(function (e) { if (e) emitDataChanged(); return e; });
    },
    'calendar:delete': function (id) {
      return col('events').then(function (rows) {
        rows = rows.filter(function (e) { return e.id !== id; });
        return saveCol('events', rows);
      }).then(function () { emitDataChanged(); return true; });
    },

    // focus
    'focus:start': function (input) {
      input = input || {};
      var f = { id: uid('focus'), taskId: input.taskId || null, projectId: input.projectId || null, goalId: input.goalId || null, startedAt: nowIso(), endedAt: null, durationMinutes: 0, distractionCount: 0, paused: false, completed: false, abandoned: false, mode: input.mode || 'focus', plannedMinutes: input.plannedMinutes || 0, actualMinutes: 0, note: input.note || '', createdAt: nowIso() };
      return col('focus').then(function (rows) { rows.push(f); return saveCol('focus', rows); }).then(function () { emitDataChanged(); return f; });
    },
    'focus:end': function (id, opts) {
      opts = opts || {};
      return col('focus').then(function (rows) {
        var found = null;
        rows = rows.map(function (f) {
          if (f.id !== id) return f;
          var end = opts.endedAt || nowIso();
          var dur = opts.durationMinutes != null ? Number(opts.durationMinutes) : Math.max(0, Math.round((new Date(end).getTime() - new Date(f.startedAt).getTime()) / 60000));
          f.endedAt = end;
          f.durationMinutes = dur;
          f.actualMinutes = dur;
          f.distractionCount = opts.distractionCount != null ? Number(opts.distractionCount) : (f.distractionCount || 0);
          f.completed = opts.completed === true || opts.complete === true;
          f.abandoned = !f.completed;
          found = f;
          return f;
        });
        return saveCol('focus', rows).then(function () { return found; });
      }).then(function (f) { if (f) emitDataChanged(); return f; });
    },
    'focus:get': function (id) {
      return col('focus').then(function (rows) {
        for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return mapFocus(rows[i]);
        return null;
      });
    },
    'focus:list': function (limit) {
      return col('focus').then(function (rows) {
        rows.sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0; });
        return rows.slice(0, Number(limit) || 50).map(mapFocus);
      });
    },
    'focus:stats': function (days) {
      days = Number(days) || 7;
      return col('focus').then(function (rows) {
        var done = rows.filter(function (f) { return f.completed === true && f.endedAt; });
        var minutesOf = function (f) { return Number(f.actualMinutes != null ? f.actualMinutes : f.durationMinutes) || 0; };
        var sessions = done.length;
        var totalMinutes = done.reduce(function (s, f) { return s + minutesOf(f); }, 0);
        var longestSession = done.reduce(function (m, f) { return Math.max(m, minutesOf(f)); }, 0);
        var avgSession = sessions ? Math.round(totalMinutes / sessions) : 0;
        var byDay = {};
        var byHour = {};
        done.forEach(function (f) {
          var d = dayOf(f.startedAt);
          var h = new Date(f.startedAt).getHours();
          byDay[d] = (byDay[d] || 0) + minutesOf(f);
          byHour[h] = (byHour[h] || 0) + minutesOf(f);
        });
        var mostProductiveHour = 0;
        var bestH = -1;
        for (var hk in byHour) if (byHour[hk] > bestH) { bestH = byHour[hk]; mostProductiveHour = Number(hk); }
        var mostProductiveDay = null;
        var bestD = -1;
        for (var dk in byDay) if (byDay[dk] > bestD) { bestD = byDay[dk]; mostProductiveDay = dk; }
        return { sessions: sessions, totalMinutes: totalMinutes, mostProductiveHour: mostProductiveHour, mostProductiveDay: mostProductiveDay, avgSession: avgSession, longestSession: longestSession, abandoned: rows.length - sessions, byDay: byDay };
      });
    },

    // journal / mood / notes
    'journal:list': function () { return journalRows(); },
    'journal:get': function (id) { return getEntity('journal', id); },
    'journal:create': function (input) {
      var now = nowIso();
      var j = { id: uid('journal'), title: String(input.title || '').trim() || 'Untitled', content: input.content || '', mood: input.mood || null, tags: input.tags || '', date: input.date || todayStr(), createdAt: now, updatedAt: now };
      return saveEntity('journal', j).then(function () { emitDataChanged(); return j; });
    },
    'journal:update': function (id, patch) {
      return getEntity('journal', id).then(function (j) { if (!j) return null; var m = merge(j, patch || {}); m.updatedAt = nowIso(); return saveEntity('journal', m).then(function () { emitDataChanged(); return m; }); });
    },
    'journal:delete': function (id) { return deleteEntity('journal', id).then(function () { emitDataChanged(); return true; }); },
    'mood:get': function (date) {
      return col('moods').then(function (rows) { for (var i = 0; i < rows.length; i++) if (rows[i].date === date) return rows[i]; return null; });
    },
    'mood:set': function (date, patch) {
      return col('moods').then(function (rows) {
        var idx = -1;
        for (var i = 0; i < rows.length; i++) if (rows[i].date === date) idx = i;
        var m = idx !== -1 ? merge(rows[idx], patch || {}) : merge({ date: date, mood: '', shoulder: '', gratitude: '' }, patch || {});
        m.date = date;
        m.updatedAt = nowIso();
        if (idx !== -1) rows[idx] = m; else rows.push(m);
        return saveCol('moods', rows);
      }).then(function (m) { emitDataChanged(); return m; });
    },
    'mood:list': function () { return col('moods'); },
    'notes:list': function () {
      return col('notes').then(function (rows) { rows.sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0; }); return rows; });
    },
    'notes:get': function (id) { return getEntity('notes', id); },
    'notes:create': function (input) {
      var now = nowIso();
      var n = { id: uid('note'), title: String(input.title || '').trim() || 'Untitled note', content: input.content || '', folderId: input.folderId || null, tags: input.tags || '', favorite: !!input.favorite, pinned: !!input.pinned, createdAt: now, updatedAt: now };
      return saveEntity('notes', n).then(function () { emitDataChanged(); return n; });
    },
    'notes:update': function (id, patch) {
      return getEntity('notes', id).then(function (n) { if (!n) return null; var m = merge(n, patch || {}); m.updatedAt = nowIso(); return saveEntity('notes', m).then(function () { emitDataChanged(); return m; }); });
    },
    'notes:delete': function (id) { return deleteEntity('notes', id).then(function () { emitDataChanged(); return true; }); },
    'notes:folders': function () { return col('noteFolders'); },
    'notes:createFolder': function (name) {
      var f = { id: uid('nf'), name: String(name || '').trim() || 'Folder', color: '#8b5cf6', createdAt: nowIso() };
      return col('noteFolders').then(function (rows) { rows.push(f); return saveCol('noteFolders', rows); }).then(function () { emitDataChanged(); return f; });
    },

    // inbox
    'inbox:add': function (content, kind) {
      var now = nowIso();
      var item = { id: uid('inbox'), content: String(content || '').trim(), kind: kind || 'task', status: 'open', createdAt: now, updatedAt: now };
      return col('inbox').then(function (rows) { rows.unshift(item); return saveCol('inbox', rows); }).then(function () { emitDataChanged(); return item; });
    },
    'inbox:list': function (incl) {
      return col('inbox').then(function (rows) {
        var out = incl ? rows : rows.filter(function (i) { return i.status !== 'done'; });
        out.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
        return out;
      });
    },
    'inbox:update': function (id, patch) {
      return col('inbox').then(function (rows) {
        var found = null;
        rows = rows.map(function (i) { if (i.id === id) { i = merge(i, patch || {}); i.updatedAt = nowIso(); found = i; } return i; });
        return saveCol('inbox', rows).then(function () { return found; });
      }).then(function (i) { if (i) emitDataChanged(); return i; });
    },
    'inbox:delete': function (id) {
      return col('inbox').then(function (rows) {
        rows = rows.filter(function (i) { return i.id !== id; });
        return saveCol('inbox', rows);
      }).then(function () { emitDataChanged(); return true; });
    },
    'inbox:clear': function () { return saveCol('inbox', []).then(function () { emitDataChanged(); return true; }); },
    'inbox:open': function (id) {
      return col('inbox').then(function (rows) {
        for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
        return null;
      }).then(function (item) {
        if (!item) return null;
        return { id: item.id, content: item.content, kind: item.kind, status: item.status, title: item.content, actions: [] };
      });
    },

    // analytics
    'analytics:daily': function (date) { return analyticsDaily(date || todayStr()); },
    'analytics:week': function (weekStart) {
      weekStart = Number(weekStart) || 1;
      var today = todayStr();
      var base = parseDate(today);
      var diff = (base.getDay() - weekStart + 7) % 7;
      base.setDate(base.getDate() - diff);
      var days = new Array(7);
      var daily = new Array(7);
      for (var i = 0; i < 7; i++) { var dd = new Date(base); dd.setDate(base.getDate() + i); days[i] = toDateStr(dd); }
      var chain = Promise.resolve();
      for (var i2 = 0; i2 < 7; i2++) {
        (function (idx) {
          chain = chain.then(function () {
            return analyticsDaily(days[idx]).then(function (d) { daily[idx] = merge({ day: days[idx] }, d); });
          });
        })(i2);
      }
      return chain.then(function () {
        var completed = 0, missed = 0, total = 0, focusMinutes = 0;
        for (var k = 0; k < daily.length; k++) {
          completed += daily[k].completed || 0;
          missed += daily[k].missed || 0;
          total += daily[k].total || 0;
          focusMinutes += daily[k].focusMinutes || 0;
        }
        return { start: days[0], end: days[6], days: days, daily: daily, completed: completed, missed: missed, total: total, focusMinutes: focusMinutes, pct: total ? Math.round((completed / total) * 100) : 0 };
      });
    },
    'analytics:month': function (year, month) {
      var y = Number(year) || new Date().getFullYear();
      var m = Number(month) || new Date().getMonth() + 1;
      var prefix = y + '-' + PAD(m);
      var nDays = new Date(y, m, 0).getDate();
      var days = [];
      for (var i = 1; i <= nDays; i++) days.push(prefix + '-' + PAD(i));
      var daily = [];
      var chain = Promise.resolve();
      days.forEach(function (d) {
        chain = chain.then(function () {
          return analyticsDaily(d).then(function (st) { daily.push(merge({ day: d }, st)); });
        });
      });
      return chain.then(function () {
        var completed = 0, missed = 0, total = 0, focusMinutes = 0;
        for (var k = 0; k < daily.length; k++) {
          completed += daily[k].completed || 0;
          missed += daily[k].missed || 0;
          total += daily[k].total || 0;
          focusMinutes += daily[k].focusMinutes || 0;
        }
        var byPct = daily.slice().sort(function (a, b) { return b.pct - a.pct; });
        var bestDay = byPct[0] || null;
        var worstDay = byPct.length ? byPct[byPct.length - 1] : null;
        return { year: y, month: m, days: days, daily: daily, completed: completed, missed: missed, total: total, focusMinutes: focusMinutes, pct: total ? Math.round((completed / total) * 100) : 0, bestDay: bestDay, worstDay: worstDay, mostConsistent: [], habitRates: [] };
      });
    },
    'analytics:year': function (year, weekStart) {
      var y = Number(year) || new Date().getFullYear();
      var out = [];
      var chain = Promise.resolve();
      for (var mo = 1; mo <= 12; mo++) {
        (function (mm) {
          chain = chain.then(function () {
            return handlers['analytics:month'](y, mm).then(function (ms) {
              out.push({ month: y + '-' + PAD(mm), stats: ms });
            });
          });
        })(mo);
      }
      return chain.then(function () {
        var daily = [];
        for (var i = 0; i < out.length; i++) {
          var m = out[i].stats.daily || [];
          for (var j = 0; j < m.length; j++) daily.push({ day: m[j].day, pct: m[j].pct || 0, completed: m[j].completed || 0, total: m[j].total || 0, focusMinutes: m[j].focusMinutes || 0 });
        }
        var totalCompleted = 0, totalFocus = 0, total = 0;
        for (var k = 0; k < daily.length; k++) { totalCompleted += daily[k].completed; totalFocus += daily[k].focusMinutes; total += daily[k].total; }
        var bestMonth = null, worstMonth = null;
        for (var i2 = 0; i2 < out.length; i2++) {
          var s = out[i2].stats;
          s.month = out[i2].month;
          s.pctUsed = s.total ? Math.round((s.completed / s.total) * 100) : 0;
        }
        var ranked = out.map(function (o) { return o.stats; }).filter(Boolean);
        ranked.sort(function (a, b) { return (b.pctUsed || 0) - (a.pctUsed || 0); });
        if (ranked.length) { bestMonth = ranked[0]; worstMonth = ranked[ranked.length - 1]; }
        return { year: y, daily: daily, total: total, completed: totalCompleted, missed: total - totalCompleted, totalCompleted: totalCompleted, focusMinutes: totalFocus, totalFocus: totalFocus, pctUsed: daily.length ? Math.round(daily.reduce(function (acc, d) { return acc + (d.pct || 0); }, 0) / daily.length) : 0, bestMonth: bestMonth ? { month: bestMonth.month, pct: bestMonth.pctUsed, completed: bestMonth.completed } : null, worstMonth: worstMonth ? { month: worstMonth.month, pct: worstMonth.pctUsed, completed: worstMonth.completed } : null };
      });
    },
    'analytics:trend': function (start, end) {
      if (!start || !end) return Promise.resolve([]);
      var days = [];
      for (var d = parseDate(start); toDateStr(d) <= end; d.setDate(d.getDate() + 1)) days.push(toDateStr(d));
      var out = [];
      var chain = Promise.resolve();
      days.forEach(function (iso) {
        chain = chain.then(function () {
          return analyticsDaily(iso).then(function (s) {
            out.push({ date: iso, pct: s.pct, tasks: s.tasks.completed, habits: s.habits.completed, focusMinutes: s.focusMinutes, score: s.pct });
          });
        });
      });
      return chain.then(function () { return out; });
    },
    'analytics:taskChart': function (days) {
      days = Number(days) || 30;
      var out = [];
      var chain = Promise.resolve();
      for (var i = days - 1; i >= 0; i--) {
        (function (idx) {
          chain = chain.then(function () {
            return analyticsDaily(addDays(todayStr(), -idx)).then(function (s) { out.push({ date: s.date, completed: s.completed, total: s.total, pct: s.pct }); });
          });
        })(i);
      }
      return chain.then(function () { return out; });
    },
    'analytics:focusChart': function (days) {
      days = Number(days) || 30;
      return col('focus').then(function (rows) {
        rows = rows.filter(function (f) { return f.completed && f.endedAt; });
        var out = [];
        for (var i = days - 1; i >= 0; i--) {
          var iso = addDays(todayStr(), -i);
          var minutes = rows.reduce(function (s, f) { return f.startedAt && dayOf(f.startedAt) === iso ? s + (Number(f.durationMinutes) || 0) : s; }, 0);
          out.push({ date: iso, minutes: minutes });
        }
        return out;
      });
    },
    'analytics:categoryBreakdown': function () {
      return listHabits(false).then(function (habits) {
        return col('habitLog').then(function (rows) {
          var catMap = {};
          habits.forEach(function (h) {
            var mine = rows.filter(function (l) { return l.habitId === h.id && (l.status === 'completed' || l.status === 'missed'); });
            var entry = catMap[h.category] || { completed: 0, total: 0 };
            entry.total += mine.length;
            entry.completed += mine.filter(function (l) { return l.status === 'completed'; }).length;
            catMap[h.category] = entry;
          });
          return Object.keys(catMap).map(function (name) {
            var v = catMap[name];
            return { name: name, completed: v.completed, total: v.total, pct: v.total ? Math.round((v.completed / v.total) * 100) : 0 };
          }).sort(function (a, b) { return b.completed - a.completed; });
        });
      });
    },
    'analytics:insights': function () { return []; },
    'analytics:score': function (w) {
      w = w || {};
      var weights = { tasks: Number(w.tasks) || 30, habits: Number(w.habits) || 25, goals: Number(w.goals) || 15, focus: Number(w.focus) || 10, routines: Number(w.routines) || 10, consistency: Number(w.consistency) || 10 };
      var today = todayStr();
      return Promise.all([analyticsDaily(today), col('goals'), col('goalSteps'), col('routines'), col('routineLogs'), col('focus'), col('habitLog'), handlers['analytics:trend'](addDays(today, -6), today)]).then(function (both) {
        var daily = both[0];
        var goals = both[1];
        var goalSteps = both[2];
        var routines = both[3];
        var routineLogs = both[4];
        var focus = both[5];
        var habitLogs = both[6];
        var last7 = both[7];
        var taskRate = Math.round((daily.tasks.completed / Math.max(1, daily.tasks.total + daily.tasks.completed)) * 100);
        var habitRate = daily.habits.total > 0 ? Math.round((daily.habits.completed / daily.habits.total) * 100) : 90;
        var goalRate = goals.length ? Math.round(goals.reduce(function (s, g) {
          var done = goalSteps.filter(function (st) { return st.goalId === g.id && (st.completed === true || st.completed === 1 || st.status === 'done'); }).length;
          var mine = goalSteps.filter(function (st) { return st.goalId === g.id; });
          var p = mine.length ? Math.round((done / mine.length) * 100) : 0;
          return s + (g.status === 'completed' ? 100 : p * 0.7);
        }, 0) / goals.length) : 80;
        var focusDone = focus.filter(function (f) { return f.completed && f.endedAt && new Date(f.endedAt) >= new Date(addDays(today, -6)); });
        var focusMin = focusDone.reduce(function (s, f) { return s + (Number(f.durationMinutes) || 0); }, 0);
        var focusRate = Math.min(100, Math.round((focusMin / (7 * 90)) * 100));
        var routineCount = routines.length;
        var weekStart = addDays(today, -(parseDate(today).getDay() + 6) % 7);
        var routineDone = routineLogs.filter(function (l) { return l.date >= weekStart && (l.completed === true || l.completed === 1); }).length;
        var routineRate = routineCount > 0 ? Math.round((routineDone / Math.max(1, routineCount * 7)) * 100) : 80;
        var consistency = last7.length ? Math.round(last7.reduce(function (s, d) { return s + (d.pct || 0); }, 0) / last7.length) : 0;
        var breakdown = { tasks: taskRate, habits: habitRate, goals: goalRate, focus: focusRate, routines: routineRate, consistency: consistency };
        var score = Math.round(
          taskRate * weights.tasks / 100 +
          habitRate * weights.habits / 100 +
          goalRate * weights.goals / 100 +
          focusRate * weights.focus / 100 +
          routineRate * weights.routines / 100 +
          consistency * weights.consistency / 100
        );
        var _ = habitLogs;
        return { score: score, breakdown: breakdown, previousTrendScore: 0 };
      });
    },

    // achievements / rewards
    'achievements:list': function () { return []; },
    'achievements:check': function () { return { unlocked: [], newXp: 0, xp: 0 }; },
    'achievements:stats': function () { return { xp: 0, level: 1, completedTasks: 0, completedHabits: 0, currentStreak: 0, streakDays: 0 }; },
    'rewards:list': function () { return []; },
    'rewards:create': function () { return null; },
    'rewards:claim': function () { return null; },

    // notifications (bell)
    'notifications:list': function () { return listNotifications(); },
    'notifications:unread': function () { return unreadCount(); },
    'notifications:read': function (id) { return notifPatch(id, { read: true }); },
    'notifications:resolve': function (id) { return notifPatch(id, { read: true, resolvedAt: nowIso() }); },
    'notifications:dismiss': function (id) { return notifPatch(id, { dismissedAt: nowIso() }); },
    'notifications:click': function (id) {
      return notifGet(id).then(function (n) {
        if (!n) return null;
        return notifPatch(id, { read: true }).then(function () {
          var page = n.targetPage || ({ task: 'tasks', habit: 'habits', class: 'university', prayer: 'prayer', routine: 'routines', event: 'calendar', warning: 'inbox' }[n.entityType] || 'inbox');
          return { page: page, entityType: n.entityType || null, entityId: n.entityId || null, targetDate: n.targetDate || null };
        });
      });
    },
    'notifications:prune': function () { return pruneStale(); },
    'notification:test': function () { return testNotification(); },

    // activity feed
    'activity:list': function (limit, entity) {
      return col('activity').then(function (rows) {
        rows = entity ? rows.filter(function (a) { return a.type === entity; }) : rows;
        rows.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
        return rows.slice(0, Number(limit) || 50);
      });
    },
    'activity:add': function (type, action, title) {
      var a = { id: uid('act'), type: type, action: action, title: String(title || ''), createdAt: nowIso() };
      return col('activity').then(function (rows) { rows.unshift(a); return saveCol('activity', rows.slice(0, 500)); });
    },

    // backup / health / export / import
    'backup:create': function () { return { path: null, timestamp: nowIso(), size: 0 }; },
    'backup:list': function () { return []; },
    'backup:restore': function () { return { ok: true, imported: 0 }; },
    'backup:selectDir': function () { return null; },
    'backup:selectFile': function () { return null; },
    'health:get': function () {
      return Promise.all([col('tasks'), col('habits'), col('notifications')]).then(function (both) {
        return { status: 'ok', dbSize: 0, taskCount: both[0].length, habitCount: both[1].length, notificationCount: both[2].length, errorRate: 0, lastCheck: nowIso() };
      });
    },
    'health:integrity': function () { return { ok: true, errors: [] }; },
    'health:optimize': function () { return { ok: true }; },
    'health:rebuild': function () { return { ok: true }; },
    'export:get': function () { return ''; },
    'import:csv': function () { return { imported: 0, skipped: 0 }; },
    'import:tasks': function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      return createRows('tasks', rows.map(function (r) { return merge({ title: String(r.title || '').trim() || 'Imported task' }, r); }), createTask);
    },
    'import:habits': function (rows) {
      return createRows('habits', Array.isArray(rows) ? rows : [], function (r) { return handlers['habits:create'](r); });
    },
    'trash:clean': function () { return { removed: 0 }; },

    // search / dashboard
    'search:all': function (q, limit) {
      q = String(q || '').toLowerCase().trim();
      limit = Number(limit) || 20;
      if (!q) return [];
      return Promise.all([col('tasks'), col('habits'), col('notes'), col('goals'), col('projects')]).then(function (both) {
        var out = [];
        var i;
        for (i = 0; i < both[0].length; i++) {
          var tt = both[0][i], s0 = scoreText(tt.title || '', q);
          if (s0 > 30) out.push({ type: 'task', id: tt.id, title: tt.title, subtitle: tt.status || 'task', score: s0 });
        }
        for (i = 0; i < both[1].length; i++) {
          var hh = both[1][i], s1 = scoreText(hh.name || '', q);
          if (s1 > 30) out.push({ type: 'habit', id: hh.id, title: hh.name, subtitle: hh.category || 'habit', score: s1 });
        }
        for (i = 0; i < both[2].length; i++) {
          var nn = both[2][i], s2 = Math.max(scoreText(nn.title || '', q), scoreText(nn.content || '', q));
          if (s2 > 30) out.push({ type: 'note', id: nn.id, title: nn.title, subtitle: 'note', score: s2 });
        }
        for (i = 0; i < both[3].length; i++) {
          var gg = both[3][i], s3 = Math.max(scoreText(gg.name || '', q), scoreText(gg.description || '', q));
          if (s3 > 30) out.push({ type: 'goal', id: gg.id, title: gg.name, subtitle: gg.status || 'goal', score: s3 });
        }
        for (i = 0; i < both[4].length; i++) {
          var pp = both[4][i], s4 = Math.max(scoreText(pp.name || '', q), scoreText(pp.description || '', q));
          if (s4 > 30) out.push({ type: 'project', id: pp.id, title: pp.name, subtitle: 'project', score: s4 });
        }
        out.sort(function (a, b) { return b.score - a.score; });
        return out.slice(0, limit);
      });
    },
    // Flat-array shape matches the shared SearchPage contract (Windows engine
    // returns the same {type,id,title,subtitle,score} records).
    'dashboard:raw': function (date) {
      date = date || todayStr();
      var today = date;
      return Promise.all([
        analyticsDaily(today), handlers['analytics:week'](1), col('tasks'), col('projects'), col('goals'),
        col('routines'), col('routineSteps'), col('events'), col('habitLog'), col('routineLogs'), col('milestones'),
        col('focus'), handlers['analytics:focusChart'](7), handlers['analytics:trend'](addDays(today, -6), today)
      ])
        .then(function (both) {
          var daily = both[0];
          var week = both[1];
          var tasksAll = both[2].filter(function (t) { return t.archiveStatus === 'active'; });
          var projects = both[3].filter(function (p) { return !p.archived && p.status !== 'archived'; });
          var goals = both[4].filter(function (g) { return !g.archived; });
          var routines = both[5].filter(function (r) { return !r.archived && r.isActive !== false; });
          var routineSteps = both[6];
          var eventsArr = both[7];
          var habitLogs = both[8];
          var routineLogs = both[9];
          var milestones = both[10];
          var focusSessions = both[11];
          var focusChart = both[12];
          var productivityTrend = both[13];

          var activeTasks = tasksAll.filter(function (t) { return t.status !== 'cancelled'; });
          var weekDays = week.days || [];

          var weeklyTasks = weekDays.map(function (day) {
            return {
              day: day,
              tasks: activeTasks
                .filter(function (t) { return t.dueDate === day; })
                .sort(function (a, b) { return (a.dueTime || '23:59') < (b.dueTime || '23:59') ? -1 : a.dueTime > b.dueTime ? 1 : 0; }),
            };
          });

          var habitMatrixPromise = handlers['habits:weekRows'](1);

          var routinesWithState = routines.map(function (r) {
            var logs = routineLogs.filter(function (l) { return l.routineId === r.id; });
            var log = null;
            for (var i = 0; i < logs.length; i++) if (logs[i].date === today) log = logs[i];
            return {
              routine: r,
              steps: routineSteps.filter(function (s) { return s.routineId === r.id; }),
              todayLog: log ? { id: log.id, routineId: log.routineId, date: log.date, completed: !!(log.completed === true || log.completed === 1), completedSteps: log.completedSteps != null ? Number(log.completedSteps) : (log.cs != null ? Number(log.cs) : 0), totalSteps: log.totalSteps != null ? Number(log.totalSteps) : (log.ts != null ? Number(log.ts) : 1) } : null,
            };
          });

          var projectRows = projects.map(function (p) {
            var mss = milestones.filter(function (m) { return m.projectId === p.id; });
            var msDone = mss.filter(function (m) { return m.completed === true || m.completed === 1 || m.done === true; }).length;
            var ptasks = activeTasks.filter(function (t) { return t.projectId === p.id; });
            var pDone = ptasks.filter(function (t) { return t.status === 'completed'; }).length;
            var mp = mss.length ? Math.round((msDone / mss.length) * 100) : 0;
            var tp = ptasks.length ? Math.round((pDone / ptasks.length) * 100) : 0;
            var next = ptasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled'; }).sort(function (a, b) { return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1; })[0] || null;
            return { project: p, progress: { total: ptasks.length, done: pDone, pct: Math.round(mp * 0.5 + tp * 0.5), tasks: ptasks.length, tasksDone: pDone, milestones: mss.length, milestonesDone: msDone, milestonePct: mp, taskPct: tp, overall: Math.round(mp * 0.5 + tp * 0.5) }, nextTask: next, openTasks: ptasks.length - pDone };
          });

          var focusDone = focusSessions.filter(function (f) { return f.completed && f.endedAt; });
          var focus = {
            sessions: focusDone.length,
            totalMinutes: focusDone.reduce(function (s, f) { return s + (Number(f.actualMinutes != null ? f.actualMinutes : f.durationMinutes) || 0); }, 0),
            mostProductiveHour: 0,
            mostProductiveDay: null,
            avgSession: focusDone.length ? Math.round(focusDone.reduce(function (s, f) { return s + (Number(f.actualMinutes != null ? f.actualMinutes : f.durationMinutes) || 0); }, 0) / focusDone.length) : 0,
            longestSession: focusDone.reduce(function (m, f) { return Math.max(m, Number(f.actualMinutes != null ? f.actualMinutes : f.durationMinutes) || 0); }, 0),
            abandoned: focusSessions.length - focusDone.length,
          };

          var completedTasks = activeTasks.filter(function (t) { return t.status === 'completed'; }).length;
          var completedHabits = habitLogs.filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).length;
          var longestStreak = 0;
          var byHabit = {};
          habitLogs.forEach(function (l) {
            (byHabit[l.habitId] = byHabit[l.habitId] || []).push(l);
          });
          Object.keys(byHabit).forEach(function (hid) {
            var dates = byHabit[hid].filter(function (l) { return l.status === 'completed' || l.status === 'done'; }).map(function (l) { return l.date; }).sort();
            var run = 0;
            var prev = null;
            for (var k = 0; k < dates.length; k++) {
              var d = dates[k];
              if (prev === null || parseDate(d).getTime() - parseDate(prev).getTime() === 86400000) run++;
              else run = 1;
              longestStreak = Math.max(longestStreak, run);
              prev = d;
            }
          });

          var stats = {
            id: 'stats-1',
            xp: completedTasks * 10 + completedHabits * 5,
            coins: completedTasks * 10,
            level: 1,
            totalTasksCompleted: completedTasks,
            totalHabitsCompleted: completedHabits,
            totalFocusMinutes: focus.totalMinutes,
            longestStreak: longestStreak,
            bestWeek: null,
            bestMonth: null,
          };

          var taskCounts = { total: activeTasks.length, completed: completedTasks, missed: daily.tasks.missed || 0, openToday: daily.tasks.missed || 0, doneToday: daily.tasks.completed || 0 };

          var score = (function () {
            var dPct = daily.pct || 0;
            var wPct = week.pct || 0;
            return { score: Math.round(dPct * 0.4 + wPct * 0.3 + (Math.min(100, focus.totalMinutes / 10)) * 0.3) };
          })();

          return habitMatrixPromise.then(function (weeklyHabitMatrix) {
            return {
              date: today,
              month: today.slice(0, 7),
              daily: daily,
              week: week,
              weekDays: weekDays,
              weeklyTasks: weeklyTasks,
              weeklyHabitMatrix: weeklyHabitMatrix,
              projects: projectRows.slice(0, 6),
              goals: [],
              routines: routinesWithState,
              routinesWithState: routinesWithState,
              university: { week: { byDay: {}, days: [], rows: [] }, today: [] },
              prayer: { next: {}, todayLog: {}, times: {}, sun: null },
              events: eventsArr.filter(function (e) { return e.date >= weekDays[0] && e.date <= weekDays[weekDays.length - 1]; }),
              stats: stats,
              focus: focus,
              score: score.score,
              achievements: [],
              taskCounts: taskCounts,
              productivityTrend: productivityTrend,
              focusChart: focusChart,
            };
          }).then(function (payload) {
            var goalRowsPromise = Promise.all(goals.slice(0, 6).map(function (g) { return goalProgress(g.id).then(function (prog) { return { goal: g, progress: prog }; }); }));
            var prayerPromise = Promise.all([handlers['prayer:daily'](today), handlers['prayer:next'](), handlers['prayer:todayLog']()]).then(function (p) {
              return { next: p[1] || {}, todayLog: p[2] || {}, times: (p[0] && p[0].times) || {}, sun: (p[0] && p[0].sunrise) ? { sunrise: p[0].sunrise, sunset: p[0].sunset } : null };
            });
            return Promise.all([goalRowsPromise, prayerPromise]).then(function (all) {
              payload.goals = all[0];
              payload.prayer = all[1];
              return payload;
            });
          });
        });
    },

    // AI
    'ai:context': function () { return { summary: 'Mobile build — AI context limited.' }; },
    'ai:analyze': function (q) {
      return Promise.all([col('tasks')]).then(function (both) {
        var open = both[0].filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled' && t.archiveStatus === 'active'; });
        var summary = 'Smart assistant works in the desktop version of ' + SMART_BRAND() + '. Currently you have ' + open.length + ' open tasks on this device. You can ask for a daily plan or quick capture in the desktop app.';
        return { summary: summary, actions: [], intent: 'query', tasks: open.map(mapTask).slice(0, 5) };
      });
    },
    'ai:execute': function (actions) { return { ok: true, executed: 0, message: 'AI actions run in the desktop version only.' }; },

    // reviews / objectives
    'review:save': function (type, data) { return getObj('reviews', {}).then(function (all) { all['' + type] = { data: data, updatedAt: nowIso() }; return setObj('reviews', all); }); },
    'objectives:list': function (weekStart) {
      return col('objectives').then(function (rows) {
        return rows.filter(function (o) { return o.weekStart === weekStart; }).map(function (o) {
          return { id: o.id, weekStart: o.weekStart, title: o.title, completed: !!(o.completed === true || o.completed === 1 || o.achieved === true), goalId: o.goalId || null, projectId: o.projectId || null, createdAt: o.createdAt };
        });
      });
    },
    'objectives:add': function (weekStart, title) {
      var o = { id: uid('obj'), weekStart: weekStart, title: String(title || '').trim(), completed: false, achieved: false, goalId: null, projectId: null, createdAt: nowIso() };
      return col('objectives').then(function (rows) { rows.push(o); return saveCol('objectives', rows); }).then(function () { emitDataChanged(); return o; });
    },
    'objectives:toggle': function (id) {
      return col('objectives').then(function (rows) {
        var found = null;
        rows = rows.map(function (o) {
          if (o.id === id) {
            var val = !(o.completed === true || o.completed === 1 || o.achieved === true);
            o.completed = val;
            o.achieved = val;
            found = o;
          }
          return o;
        });
        return saveCol('objectives', rows).then(function () { return found; });
      }).then(function (o) {
        if (o) {
          emitDataChanged();
          return { id: o.id, weekStart: o.weekStart, title: o.title, completed: !!(o.completed === true || o.completed === 1 || o.achieved === true), goalId: o.goalId || null, projectId: o.projectId || null, createdAt: o.createdAt };
        }
        return null;
      });
    },

    // university
    'university:profile': function () {
      return getObj('uniProfile', { id: 'uni-1', major: '', level: '', gpa: 0, requiredClasses: 0, optionalClasses: 0, posts: 0, createdAt: nowIso(), updatedAt: nowIso() });
    },
    'university:saveProfile': function (patch) {
      return this['university:profile']().then(function (p) {
        var m = merge(p, patch || {});
        m.updatedAt = nowIso();
        return setObj('uniProfile', m).then(function () { emitDataChanged(); return m; });
      });
    },
    'university:classes': function () { return col('uniClasses'); },
    'university:classCreate': function (input) {
      var c = { id: uid('uni'), name: String(input.name || '').trim() || 'Class', subject: input.subject || '', professor: input.professor || '', color: input.color || '#8b5cf6', schedule: input.schedule || [], createdAt: nowIso(), updatedAt: nowIso() };
      return col('uniClasses').then(function (rows) { rows.push(c); return saveCol('uniClasses', rows); }).then(function () { emitDataChanged(); return c; });
    },
    'university:classUpdate': function (id, patch) {
      return col('uniClasses').then(function (rows) {
        var found = null;
        rows = rows.map(function (c) { if (c.id === id) { c = merge(c, patch || {}); c.updatedAt = nowIso(); found = c; } return c; });
        return saveCol('uniClasses', rows).then(function () { return found; });
      }).then(function (c) { if (c) emitDataChanged(); return c; });
    },
    'university:classDelete': function (id) {
      return col('uniClasses').then(function (rows) {
        rows = rows.filter(function (c) { return c.id !== id; });
        return saveCol('uniClasses', rows);
      }).then(function () { emitDataChanged(); return true; });
    },
    'university:week': function () { return { days: [], rows: [] }; },
    'university:today': function () { return []; },
    'university:classesRange': function () { return []; },
    'customEvents:list': function () { return col('customEvents'); },
    'customEvents:create': function (input) {
      var e = eventToRow(input || {});
      return col('customEvents').then(function (rows) { rows.push(e); return saveCol('customEvents', rows); }).then(function () { emitDataChanged(); return e; });
    },
    'customEvents:update': function (id, patch) {
      return col('customEvents').then(function (rows) {
        var found = null;
        rows = rows.map(function (e) { if (e.id === id) { e = merge(e, patch || {}); found = e; } return e; });
        return saveCol('customEvents', rows).then(function () { return found; });
      }).then(function (e) { if (e) emitDataChanged(); return e; });
    },
    'customEvents:delete': function (id) {
      return col('customEvents').then(function (rows) {
        rows = rows.filter(function (e) { return e.id !== id; });
        return saveCol('customEvents', rows);
      }).then(function () { emitDataChanged(); return true; });
    },

    // prayer
    'prayer:settings': function () { return getPrayerSettings(); },
    'prayer:saveSettings': function (patch) { return savePrayerSettings(patch || {}); },
    'prayer:daily': function (date) { return prayerDaily(date || todayStr()); },
    'prayer:week': function () { return prayerWeek(); },
    'prayer:next': function () { return prayerNext(); },
    'prayer:sun': function (date) { return prayerDaily(date || todayStr()).then(function (d) { return { date: d.date, sunrise: d.sunrise, sunset: d.sunset }; }); },
    'prayer:toggle': function (p, date) { return togglePrayerLog(p, date || todayStr()); },
    'prayer:todayLog': function () { return prayerLogFor(todayStr()); },
    'prayer:stats': function (days) { return prayerStats(days); },

    // util / fs
    'fs:openPath': function () { return { ok: true, path: null }; },
    'fs:saveFile': function () { return { ok: false, error: 'File system saving is available in the desktop version only.' }; },
  };

  function createRows(name, rows, creator) {
    var chain = Promise.resolve();
    var count = 0;
    rows.forEach(function (r) {
      chain = chain.then(function () { return creator(r); }).then(function () { count++; }).catch(function () {});
    });
    return chain.then(function () { return { imported: count, skipped: rows.length - count }; });
  }

  // =====================================================================
  // API bridge — same contract as electron preload
  // =====================================================================
  function invoke(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      var fn = handlers[channel];
      if (typeof fn !== 'function') {
        return Promise.resolve({ ok: false, error: 'Not available on this device: ' + channel });
      }
      return Promise.resolve(fn.apply(handlers, args)).then(function (data) {
        return { ok: true, data: data };
      }).catch(function (err) {
        return { ok: false, error: (err && err.message) ? err.message : String(err) };
      });
    } catch (e) {
      return Promise.resolve({ ok: false, error: (e && e.message) ? e.message : String(e) });
    }
  }

  global.ahmedAPI = {
    invoke: invoke,
    on: on,
    requestBackupPath: function () { return Promise.resolve(null); },
    openPath: function () { return Promise.resolve({ ok: true }); },
  };

  // Test-only mirror of pure helper functions so vitest can compare desktop and
  // mobile implementations side-by-side without breaking the runtime contract.
  if (typeof global !== 'undefined' && typeof process !== 'undefined') {
    global.smartMirror = {
      units: {
        normalizeUnit: normalizeUnit,
        unitCategory: unitCategoryShim,
        convertValue: convertValueShim,
        unitsCompatible: function (a, b) { return convertValueShim(1, a, b) !== null; },
      },
      resolveTaskContribution: resolveTaskContributionShim,
      resolveHabitContribution: resolveHabitContributionShim,
      stepSmartContribution: stepSmartContributionShim,
      computeSmartCurrent: computeSmartCurrentShim,
    };
  }

  // =====================================================================
  // boot: sync after load, register Capacitor listeners
  // =====================================================================
  function bootMobile() {
    if (!isNative()) return;
    registerNativeListeners();
    // Kick off scheduling after the app UI starts; permission dialog comes later
    // only if notifications are enabled in settings.
    setTimeout(function () {
      getSettings().then(function (s) {
        if (s.notificationsEnabled) resyncSchedules();
      });
    }, 1200);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootMobile);
    } else {
      bootMobile();
    }
  }
})(typeof window !== 'undefined' ? window : this);