import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Modal,
  TextInput,
  Platform,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCommand } from '../services/commands';
import { theme } from '../theme';

type Props = {
  deviceId: string;
};

export type ReminderType = 'time_date' | 'interval' | 'recurring';

export interface ReminderItem {
  id: string;
  title: string;
  type: ReminderType;
  enabled: boolean;
  time: string; // "HH:MM" 24h
  date?: string; // "YYYY-MM-DD"
  intervalMinutes?: number; // 15, 30, 45, 60, 90, 120
  recurringDays?: string[]; // ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  lastTriggeredAt?: number;
}

const STORAGE_KEY_PREFIX = 'chotubot:reminders:';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function RemindersScreen({ deviceId }: Props) {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderItem | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ReminderType>('time_date');
  const [time, setTime] = useState('09:00');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  const [activeAlert, setActiveAlert] = useState<string | null>(null);

  // Load Reminders
  useEffect(() => {
    loadReminders();
  }, [deviceId]);

  async function loadReminders() {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + deviceId);
      if (json) {
        setReminders(JSON.parse(json));
      } else {
        // Initial Default Presets
        const defaults: ReminderItem[] = [
          {
            id: '1',
            title: '💧 Hydration Drink Water Alert',
            type: 'interval',
            enabled: true,
            time: '09:00',
            intervalMinutes: 45,
            lastTriggeredAt: Date.now(),
          },
          {
            id: '2',
            title: '🍱 Lunch Meal Time Alert',
            type: 'time_date',
            enabled: true,
            time: '13:00',
            date: new Date().toISOString().split('T')[0],
          },
          {
            id: '3',
            title: '💊 Evening Medication Reminder',
            type: 'recurring',
            enabled: true,
            time: '20:00',
            recurringDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          },
        ];
        setReminders(defaults);
        await AsyncStorage.setItem(STORAGE_KEY_PREFIX + deviceId, JSON.stringify(defaults));
      }
    } catch (e) {
      console.warn('Could not load reminders:', e);
    }
  }

  async function saveReminders(items: ReminderItem[]) {
    setReminders(items);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PREFIX + deviceId, JSON.stringify(items));
    } catch (e) {
      console.warn('Could not save reminders:', e);
    }
  }

  // Active Reminder Check Loop
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDateStr = now.toISOString().split('T')[0];
      const currentDayStr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

      let updated = false;
      const newItems = reminders.map((item) => {
        if (!item.enabled) return item;

        let shouldTrigger = false;

        if (item.type === 'time_date') {
          if (item.time === currentTimeStr && (!item.date || item.date === currentDateStr)) {
            if (!item.lastTriggeredAt || nowMs - item.lastTriggeredAt > 60000) {
              shouldTrigger = true;
            }
          }
        } else if (item.type === 'interval') {
          const intervalMs = (item.intervalMinutes || 30) * 60 * 1000;
          if (!item.lastTriggeredAt || nowMs - item.lastTriggeredAt >= intervalMs) {
            shouldTrigger = true;
          }
        } else if (item.type === 'recurring') {
          if (item.time === currentTimeStr && item.recurringDays?.includes(currentDayStr)) {
            if (!item.lastTriggeredAt || nowMs - item.lastTriggeredAt > 60000) {
              shouldTrigger = true;
            }
          }
        }

        if (shouldTrigger) {
          updated = true;
          triggerReminderAlert(item);
          return { ...item, lastTriggeredAt: nowMs };
        }
        return item;
      });

      if (updated) {
        saveReminders(newItems);
      }
    }, 12000);

    return () => clearInterval(timer);
  }, [reminders, deviceId]);

  function triggerReminderAlert(item: ReminderItem) {
    setActiveAlert(item.title);
    // Send live alert command to NANA OLED screen
    sendCommand(deviceId, {
      type: 'notification',
      title: '⏰ ALARM ALERT',
      body: item.title,
      durationMs: 8000,
    });
  }

  function toggleReminder(id: string) {
    const updated = reminders.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    saveReminders(updated);
  }

  function deleteReminder(id: string) {
    Alert.alert('Delete Reminder', 'Are you sure you want to remove this alarm?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = reminders.filter((r) => r.id !== id);
          saveReminders(updated);
        },
      },
    ]);
  }

  function openAddModal() {
    setEditingReminder(null);
    setTitle('');
    setType('time_date');
    setTime('09:00');
    setDate(new Date().toISOString().split('T')[0]);
    setIntervalMinutes(30);
    setSelectedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setModalVisible(true);
  }

  function openEditModal(item: ReminderItem) {
    setEditingReminder(item);
    setTitle(item.title);
    setType(item.type);
    setTime(item.time || '09:00');
    setDate(item.date || new Date().toISOString().split('T')[0]);
    setIntervalMinutes(item.intervalMinutes || 30);
    setSelectedDays(item.recurringDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setModalVisible(true);
  }

  function handleSave() {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a title for the reminder.');
      return;
    }

    const newItem: ReminderItem = {
      id: editingReminder ? editingReminder.id : String(Date.now()),
      title: title.trim(),
      type,
      enabled: true,
      time,
      date: type === 'time_date' ? date : undefined,
      intervalMinutes: type === 'interval' ? intervalMinutes : undefined,
      recurringDays: type === 'recurring' ? selectedDays : undefined,
      lastTriggeredAt: editingReminder ? editingReminder.lastTriggeredAt : undefined,
    };

    let updated: ReminderItem[];
    if (editingReminder) {
      updated = reminders.map((r) => (r.id === editingReminder.id ? newItem : r));
    } else {
      updated = [newItem, ...reminders];
    }

    saveReminders(updated);
    setModalVisible(false);

    // Send immediate sync to NANA's settings/reminder system
    if (type === 'interval') {
      sendCommand(deviceId, { type: 'settings', waterMin: intervalMinutes });
    }
  }

  function toggleDay(day: string) {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  }

  const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 10 : 12;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: STATUSBAR_HEIGHT }]}>
      {/* Header Bar */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.brandTitle}>REMINDERS & ALARMS</Text>
          <Text style={styles.subTitle}>Sync time alerts with NANA OLED display</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.7}>
          <Text style={styles.addBtnText}>+ ADD ALARM</Text>
        </TouchableOpacity>
      </View>

      {/* Preset Quick Actions */}
      <Text style={styles.sectionTitle}>QUICK PRESET ALERTS</Text>
      <View style={styles.presetRow}>
        <TouchableOpacity
          style={[styles.presetChip, { borderColor: theme.colors.accent }]}
          onPress={() => {
            triggerReminderAlert({
              id: 'quick_water',
              title: '💧 Hydration Alert: Time to drink water!',
              type: 'interval',
              enabled: true,
              time: 'now',
            });
          }}
        >
          <Text style={styles.presetText}>💧 Drink Water Now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetChip, { borderColor: theme.colors.amber }]}
          onPress={() => {
            triggerReminderAlert({
              id: 'quick_meal',
              title: '🍱 Meal Time: Lunch / Dinner Alert!',
              type: 'time_date',
              enabled: true,
              time: 'now',
            });
          }}
        >
          <Text style={styles.presetText}>🍱 Meal Time Alert</Text>
        </TouchableOpacity>
      </View>

      {/* Reminder List */}
      <Text style={styles.sectionTitle}>ACTIVE SCHEDULED ALARMS ({reminders.length})</Text>
      {reminders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Alarms Set</Text>
          <Text style={styles.emptyText}>Tap "+ ADD ALARM" to create a new reminder schedule.</Text>
        </View>
      ) : (
        reminders.map((item) => (
          <View key={item.id} style={[styles.reminderCard, !item.enabled && styles.disabledCard]}>
            <View style={styles.cardMain}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reminderTitle, !item.enabled && styles.mutedText]}>{item.title}</Text>

                <Text style={styles.reminderSub}>
                  {item.type === 'time_date' && `🕒 Time: ${item.time} | Date: ${item.date || 'Today'}`}
                  {item.type === 'interval' && `⏱️ Every ${item.intervalMinutes} Minutes Interval`}
                  {item.type === 'recurring' && `🔄 ${item.time} on ${item.recurringDays?.join(', ')}`}
                </Text>
              </View>

              <Switch
                value={item.enabled}
                onValueChange={() => toggleReminder(item.id)}
                trackColor={{ false: '#334155', true: theme.colors.accentBg }}
                thumbColor={item.enabled ? theme.colors.accent : '#94a3b8'}
              />
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
                <Text style={styles.editBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteReminder(item.id)} style={styles.actionBtn}>
                <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingReminder ? '✏️ EDIT ALARM' : '⏰ ADD NEW ALARM'}</Text>

              <Text style={styles.inputLabel}>Reminder Title / Message</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Take Medicine / Drink Water"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.inputLabel}>Alarm Type</Text>
              <View style={styles.typeRow}>
                {(['time_date', 'interval', 'recurring'] as ReminderType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                      {t === 'time_date' ? 'Time & Date' : t === 'interval' ? 'Interval' : 'Recurring'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {type !== 'interval' && (
                <View>
                  <Text style={styles.inputLabel}>Time (24h format HH:MM)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={time}
                    onChangeText={setTime}
                    placeholder="HH:MM (e.g. 14:30)"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
              )}

              {type === 'time_date' && (
                <View>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
              )}

              {type === 'interval' && (
                <View>
                  <Text style={styles.inputLabel}>Interval (Minutes)</Text>
                  <View style={styles.typeRow}>
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.typeBtn, intervalMinutes === m && styles.typeBtnActive]}
                        onPress={() => setIntervalMinutes(m)}
                      >
                        <Text style={[styles.typeBtnText, intervalMinutes === m && styles.typeBtnTextActive]}>
                          {m}m
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {type === 'recurring' && (
                <View>
                  <Text style={styles.inputLabel}>Repeat Days</Text>
                  <View style={styles.daysRow}>
                    {DAYS_OF_WEEK.map((d) => {
                      const isSelected = selectedDays.includes(d);
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.dayChip, isSelected && styles.dayChipActive]}
                          onPress={() => toggleDay(d)}
                        >
                          <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save Alarm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Triggered Alarm Popup Modal */}
      <Modal visible={activeAlert !== null} transparent animationType="fade" onRequestClose={() => setActiveAlert(null)}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <Text style={styles.alertIcon}>⏰</Text>
            <Text style={styles.alertHeader}>ALARM ALERT</Text>
            <Text style={styles.alertBody}>{activeAlert}</Text>
            <TouchableOpacity style={styles.alertDismissBtn} onPress={() => setActiveAlert(null)}>
              <Text style={styles.alertDismissText}>DISMISS ALARM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: theme.colors.bg, flexGrow: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  brandTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.5 },
  subTitle: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: theme.colors.accentBg, borderWidth: 1, borderColor: theme.colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { fontSize: 11, fontWeight: '800', color: theme.colors.accent },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.accent, letterSpacing: 1, marginTop: 12, marginBottom: 10 },

  presetRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  presetChip: { flex: 1, paddingVertical: 12, borderRadius: theme.radius, backgroundColor: theme.colors.card, borderWidth: 1, alignItems: 'center' },
  presetText: { fontSize: 12, fontWeight: '700', color: theme.colors.text },

  reminderCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius, padding: 14, marginBottom: 10 },
  disabledCard: { opacity: 0.55 },
  cardMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  reminderSub: { fontSize: 11, color: theme.colors.textSecondary },
  mutedText: { color: theme.colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 14, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)' },
  actionBtn: { paddingVertical: 2 },
  editBtnText: { fontSize: 11, fontWeight: '700', color: theme.colors.accent },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: theme.colors.danger },

  emptyCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.cardBorder },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  emptyText: { fontSize: 12, color: theme.colors.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.colors.cardBorder, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 16, textAlign: 'center' },
  inputLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.accent, marginBottom: 6, marginTop: 10 },
  textInput: { borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.controlRadius, padding: 10, fontSize: 14, backgroundColor: '#1e293b', color: theme.colors.text },

  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1e293b', borderWidth: 1, borderColor: theme.colors.cardBorder, alignItems: 'center' },
  typeBtnActive: { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent },
  typeBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  typeBtnTextActive: { color: theme.colors.accent, fontWeight: '800' },

  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: theme.colors.cardBorder },
  intervalChipActive: { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent },
  intervalText: { fontSize: 12, color: theme.colors.textSecondary },
  intervalTextActive: { color: theme.colors.accent, fontWeight: '800' },

  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayChip: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1e293b', borderWidth: 1, borderColor: theme.colors.cardBorder },
  dayChipActive: { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent },
  dayText: { fontSize: 11, color: theme.colors.textSecondary },
  dayTextActive: { color: theme.colors.accent, fontWeight: '800' },

  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.controlRadius, borderWidth: 1, borderColor: theme.colors.cardBorder, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.controlRadius, backgroundColor: theme.colors.accentBg, borderWidth: 1, borderColor: theme.colors.accent, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: theme.colors.accent },

  alertOverlay: { flex: 1, backgroundColor: 'rgba(3, 7, 18, 0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertCard: { width: '100%', backgroundColor: theme.colors.card, borderRadius: theme.radius, borderWidth: 2, borderColor: theme.colors.accent, padding: 24, alignItems: 'center' },
  alertIcon: { fontSize: 40, marginBottom: 10 },
  alertHeader: { fontSize: 18, fontWeight: '900', color: theme.colors.accent, marginBottom: 6 },
  alertBody: { fontSize: 14, fontWeight: '600', color: theme.colors.text, textAlign: 'center', marginBottom: 20 },
  alertDismissBtn: { backgroundColor: theme.colors.accentBg, borderWidth: 1, borderColor: theme.colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.controlRadius },
  alertDismissText: { fontSize: 13, fontWeight: '800', color: theme.colors.accent },
});
