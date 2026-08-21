import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { useRoles } from "@/hooks/useRoles";
import { MedicalCross } from "@/components/MedicalCross";
import { appleCardStyle } from "@/components/AppleSurface";
import { DatePickerField } from "@/components/DatePickerField";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { AppLanguage, Shift, User } from "@/models";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/** Montag der Woche, zu der das Datum gehoert (als lokaler Tagesanfang). */
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

/** ISO-Kalenderwoche (Montag als Wochenstart), fuer die Wochenkennung im Plan. */
function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((x.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDay(d: Date, lang: AppLanguage): string {
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function fmtShort(d: Date, lang: AppLanguage): string {
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit" });
}

function dateWithTime(d: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0);
}

interface ShiftModalProps {
  shift: Shift | null;
  defaultDate: Date;
  paramedics: User[];
  lang: AppLanguage;
  theme: ReturnType<typeof getTheme>;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function ShiftModal({ shift, defaultDate, paramedics, lang, theme, onClose, onSaved, onDeleted }: ShiftModalProps) {
  const [title, setTitle] = useState(shift?.title ?? "");
  const [location, setLocation] = useState(shift?.location ?? "");
  const [date, setDate] = useState(() => (shift ? new Date(shift.startsAt) : defaultDate));
  const [startTime, setStartTime] = useState(() => (shift ? fmtTime(new Date(shift.startsAt)) : "13:00"));
  const [endTime, setEndTime] = useState(() => (shift ? fmtTime(new Date(shift.endsAt)) : "14:00"));
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(shift?.members.map((m) => m.userId) ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const displayName = (u: User) =>
    u.firstName && u.lastName
      ? `${u.firstName.charAt(0).toUpperCase() + u.firstName.slice(1).toLowerCase()} ${u.lastName.charAt(0).toUpperCase() + u.lastName.slice(1).toLowerCase()}`
      : u.id.replace("iserv-", "");

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!title.trim()) {
      setError(t("duty.rosterTitleRequired", lang));
      return;
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      setError(t("duty.rosterTimeInvalid", lang));
      return;
    }
    const startsAt = dateWithTime(date, startTime);
    const endsAt = dateWithTime(date, endTime);
    if (endsAt <= startsAt) {
      setError(t("duty.rosterTimeInvalid", lang));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (shift) {
        await ApiService.updateShift(shift.id, {
          title: title.trim(),
          location: location.trim() || null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      } else {
        await ApiService.createShift({
          title: title.trim(),
          location: location.trim() || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          memberIds: [...memberIds],
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("duty.rosterCreateError", lang));
      setSaving(false);
    }
  }

  async function remove() {
    if (!shift) return;
    const ok = await confirmAction({
      title: t("duty.rosterDelete", lang),
      message: t("duty.rosterDeleteConfirm", lang),
      confirmLabel: t("common.delete", lang),
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await ApiService.deleteShift(shift.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("duty.rosterDeleteError", lang));
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {shift ? t("duty.rosterEditTitle", lang) : t("duty.rosterNewTitle", lang)}
          </Text>
          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ gap: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
              <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>{t("duty.rosterFieldTitle", lang)}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("duty.rosterFieldTitlePlaceholder", lang)}
                placeholderTextColor={theme.textTertiary}
                style={[styles.inputText, { color: theme.text }]}
              />
            </View>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
              <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>{t("duty.rosterFieldLocation", lang)}</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder={t("duty.rosterFieldLocationPlaceholder", lang)}
                placeholderTextColor={theme.textTertiary}
                style={[styles.inputText, { color: theme.text }]}
              />
            </View>
            <DatePickerField value={date} onChange={setDate} label={t("duty.rosterFieldDate", lang)} />
            <View style={styles.timeRow}>
              <View style={[styles.inputWrap, { flex: 1, backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>{t("duty.rosterFieldStart", lang)}</Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="13:00"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.inputText, { color: theme.text }]}
                  autoCapitalize="none"
                />
              </View>
              <View style={[styles.inputWrap, { flex: 1, backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>{t("duty.rosterFieldEnd", lang)}</Text>
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="14:00"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.inputText, { color: theme.text }]}
                  autoCapitalize="none"
                />
              </View>
            </View>
            {paramedics.length > 0 && (
              <View>
                <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>{t("duty.rosterFieldMembers", lang)}</Text>
                <View style={styles.memberRow}>
                  {paramedics.map((u) => {
                    const active = memberIds.has(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => toggleMember(u.id)}
                        style={[
                          styles.memberChip,
                          {
                            backgroundColor: active ? theme.tint : theme.inputBackground,
                            borderColor: active ? theme.tint : theme.inputBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.memberChipText, { color: active ? "#fff" : theme.text }]}>{displayName(u)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {error && <Text style={[styles.modalError, { color: theme.danger }]}>{error}</Text>}
            <Pressable onPress={save} disabled={saving} style={[styles.modalSave, { backgroundColor: theme.tint }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>{t("duty.rosterSave", lang)}</Text>}
            </Pressable>
            {shift && (
              <Pressable onPress={remove} disabled={saving} style={[styles.modalDelete, { borderColor: theme.cardBorder }]}>
                <Text style={[styles.modalDeleteText, { color: theme.danger }]}>{t("duty.rosterDelete", lang)}</Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={[styles.modalCancel, { borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>{t("common.cancel", lang)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function DutyScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const dutyStatus = useAppStore((s) => s.dutyStatus);
  const dutyLoading = useAppStore((s) => s.dutyLoading);
  const setDutyStatus = useAppStore((s) => s.setDutyStatus);
  const setDutyLoading = useAppStore((s) => s.setDutyLoading);

  const roles = useRoles();
  const [onDutyUsers, setOnDutyUsers] = useState<User[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [modal, setModal] = useState<{ shift: Shift | null } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const userId = user?.id;

  const isOnDuty = dutyStatus === "on_duty";
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const canManage = (user?.permissions ?? []).includes("roster.manage");
  const paramedics = users.filter((u) => (u.role ?? "").startsWith("sanitaeter"));

  useEffect(() => {
    // sync own duty status from backend so it's correct after app reopen
    ApiService.getDutyStatus()
      .then((s) => setDutyStatus(s.status))
      .catch(() => {});
    setListLoading(true);
    ApiService.getOnDutyUsers()
      .then(setOnDutyUsers)
      .catch((err) => {
        console.error("Failed to load on-duty users:", err);
        notify(t("common.error", lang), t("duty.updateFailed", lang));
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    setRosterLoading(true);
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
    ApiService.getShifts(weekStart.toISOString(), weekEnd.toISOString())
      .then(setShifts)
      .catch((err) => {
        console.error("Failed to load roster:", err);
        notify(t("common.error", lang), t("duty.updateFailed", lang));
      })
      .finally(() => setRosterLoading(false));
  }, [weekStart]);

  function moveWeek(delta: number) {
    setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7 * delta));
  }

  async function doJoin(shiftId: string) {
    if (busyShiftId) return;
    setBusyShiftId(shiftId);
    try {
      await ApiService.joinShift(shiftId);
      notify(t("duty.joinedShift", lang), "");
      moveWeek(0);
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : t("duty.joinError", lang));
    } finally {
      setBusyShiftId(null);
    }
  }

  async function doLeave(shiftId: string) {
    if (busyShiftId) return;
    setBusyShiftId(shiftId);
    try {
      await ApiService.leaveShift(shiftId);
      notify(t("duty.leftShift", lang), "");
      moveWeek(0);
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : t("duty.leaveError", lang));
    } finally {
      setBusyShiftId(null);
    }
  }

  function openModal(shift: Shift | null) {
    setModal({ shift });
    if (users.length === 0) {
      ApiService.getAllUsers()
        .then(setUsers)
        .catch(() => {});
    }
  }

  async function handleToggle() {
    if (dutyLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.93, {}, () => { scale.value = withSpring(1); });
    setDutyLoading(true);
    const newStatus = isOnDuty ? "off_duty" : "on_duty";
    const previous = dutyStatus;
    // Optimistisch: UI schaltet sofort um, Ruecksetzen erst bei Fehler.
    setDutyStatus(newStatus);
    try {
      await ApiService.updateDutyStatus(newStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const updated = await ApiService.getOnDutyUsers();
      setOnDutyUsers(updated);
    } catch (err) {
      // Rollback auf den vorherigen Zustand, damit der Nutzer nicht glaubt,
      // der Wechsel sei durchgegangen.
      setDutyStatus(previous);
      console.error("Failed to update duty status:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : t("duty.updateFailed", lang);
      notify(t("common.error", lang), message);
    } finally {
      setDutyLoading(false);
    }
  }

  // Notruf mit Sicherheitsabfrage: Ein eigener Modal statt der Standard-Dialoge,
  // damit klar ist, was gleich passiert, und versehentliche/faelschliche Notrufe
  // (strafbar nach § 145 StGB) vermieden werden. Die App setzt selbst keinen
  // Notruf ab -- sie oeffnet nur die Telefon-App des Geraets mit der 112.
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  async function dialEmergency() {
    setEmergencyOpen(false);
    try {
      if (Platform.OS === "web") {
        // tel: funktioniert in mobilen Browsern (iPad/Smartphone); auf dem
        // Desktop ist es ein No-op, daher der Fallback mit angezeigter Nummer.
        window.open("tel:112", "_self");
      } else {
        await Linking.openURL("tel:112");
      }
    } catch {
      notify(t("common.error", lang), t("emergency.callFailed", lang));
    }
  }

  const topPad = useTopPad();

  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = new Date(s.startsAt).toDateString();
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }
  const dayKeys = [...byDay.keys()].sort();

  const weekLast = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const weekRange = t("duty.rosterWeekRange", lang)
    .replace("{from}", fmtShort(weekStart, lang))
    .replace("{to}", fmtShort(weekLast, lang));

  // Wochenuebersicht Mo–Fr wie auf der Landing-Demo: pro Tag die Vornamen der
  // Eingetragenen, "Offen", wenn eine Schicht noch niemanden hat.
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const key = d.toDateString();
    const dayShifts = byDay.get(key) ?? [];
    const names = Array.from(
      new Set(dayShifts.flatMap((s) => s.members.map((m) => m.userName.split(" ")[0]))),
    );
    return { d, key, names, open: dayShifts.some((s) => s.members.length === 0) };
  });
  const openShifts = shifts.filter((s) => s.members.length === 0);
  const todayKey = new Date().toDateString();
  const visibleDayKeys = selectedDay ? [selectedDay] : dayKeys;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <Text style={[styles.heading, { color: theme.text, flex: 1 }]}>
            {t("duty.title", lang)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("emergency.call", lang)}
            onPress={() => setEmergencyOpen(true)}
            style={({ pressed }) => [
              styles.emergencyBtn,
              { borderColor: theme.danger, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="call" size={16} color={theme.danger} />
            <Text style={[styles.emergencyText, { color: theme.danger }]}>{t("emergency.call", lang)}</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: "center", gap: 24 }}>
          <MedicalCross size={80} color={isOnDuty ? theme.tint : theme.textTertiary} animate={isOnDuty} />

          <Animated.View style={animatedStyle}>
            <Pressable
              onPress={handleToggle}
              disabled={dutyLoading}
              style={[
                styles.toggleBtn,
                { backgroundColor: isOnDuty ? theme.tint : theme.textTertiary },
              ]}
            >
              {dutyLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={isOnDuty ? "shield-check" : "shield-off"}
                    size={28}
                    color="#fff"
                  />
                  <Text style={styles.toggleBtnLabel}>
                    {isOnDuty ? t("duty.onDuty", lang) : t("duty.offDuty", lang)}
                  </Text>
                  <Text style={styles.toggleBtnHint}>{t("duty.tapToToggle", lang)}</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.statusCard, { backgroundColor: isOnDuty ? theme.tintLight : theme.backgroundTertiary }]}>
          <Ionicons
            name={isOnDuty ? "checkmark-circle" : "close-circle"}
            size={20}
            color={isOnDuty ? theme.tint : theme.textTertiary}
          />
          <Text style={[styles.statusText, { color: isOnDuty ? theme.tintDark : theme.textSecondary }]}>
            {isOnDuty ? t("duty.statusAvailable", lang) : t("duty.statusUnavailable", lang)}
          </Text>
        </View>

        <View style={[styles.section, appleCardStyle(theme)]}>
          <View style={styles.rosterHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("duty.rosterTitle", lang)}</Text>
            {canManage && (
              <Pressable onPress={() => openModal(null)} style={[styles.addBtn, { backgroundColor: theme.tint }]}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{t("duty.rosterAdd", lang)}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.rosterWeekRow}>
            <Pressable onPress={() => moveWeek(-1)} hitSlop={10} style={styles.weekNav}>
              <Ionicons name="chevron-back" size={20} color={theme.tint} />
            </Pressable>
            <Text style={[styles.rosterWeekLabel, { color: theme.text }]}>
              {t("duty.rosterWeekShort", lang)} {isoWeek(weekStart)} · {weekRange}
            </Text>
            <Pressable onPress={() => moveWeek(1)} hitSlop={10} style={styles.weekNav}>
              <Ionicons name="chevron-forward" size={20} color={theme.tint} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((wd) => {
              const selected = selectedDay === wd.key;
              const today = wd.key === todayKey;
              return (
                <Pressable
                  key={wd.key}
                  onPress={() => setSelectedDay(selected ? null : wd.key)}
                  style={[
                    styles.weekCell,
                    { borderColor: selected || today ? theme.tint : theme.cardBorder },
                    today && { backgroundColor: theme.tintLight },
                  ]}
                >
                  <Text style={[styles.weekCellDay, { color: theme.textSecondary }]}>
                    {wd.d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "short" }).replace(".", "")}
                  </Text>
                  <Text style={[styles.weekCellDate, { color: theme.text }]}>{wd.d.getDate()}</Text>
                  {wd.open ? (
                    <Text style={[styles.weekCellOpen, { color: theme.danger }]}>{t("duty.rosterOpen", lang)}</Text>
                  ) : (
                    <Text
                      numberOfLines={2}
                      style={[styles.weekCellNames, { color: wd.names.length ? theme.tintDark : theme.textTertiary }]}
                    >
                      {wd.names.length ? wd.names.join(" · ") : "—"}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {openShifts.length > 0 && (
            <View style={[styles.vertretungCard, { borderColor: theme.danger }]}>
              <Text style={[styles.vertretungTitle, { color: theme.danger }]}>{t("duty.vertretungTitle", lang)}</Text>
              <Text style={[styles.vertretungDesc, { color: theme.textSecondary }]}>{t("duty.vertretungDesc", lang)}</Text>
              {openShifts.map((s) => (
                <View key={s.id} style={styles.vertretungRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.shiftTitle, { color: theme.text }]}>{s.title}</Text>
                    <Text style={[styles.shiftMembers, { color: theme.textTertiary }]}>
                      {fmtDay(new Date(s.startsAt), lang)} · {fmtTime(new Date(s.startsAt))}–{fmtTime(new Date(s.endsAt))}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => doJoin(s.id)}
                    disabled={busyShiftId !== null}
                    style={[styles.joinBtn, { backgroundColor: theme.tint }]}
                  >
                    {busyShiftId === s.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.joinBtnText}>{t("duty.joinShift", lang)}</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {selectedDay && (
            <Pressable onPress={() => setSelectedDay(null)} hitSlop={6}>
              <Text style={[styles.filterReset, { color: theme.tint }]}>{t("duty.rosterAllDays", lang)}</Text>
            </Pressable>
          )}

          {rosterLoading ? (
            <ActivityIndicator color={theme.tint} />
          ) : dayKeys.length === 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={[styles.noOne, { color: theme.textSecondary }]}>{t("duty.rosterNoShifts", lang)}</Text>
              <Text style={[styles.hintText, { color: theme.textTertiary }]}>{t("duty.rosterNoShiftsDesc", lang)}</Text>
            </View>
          ) : visibleDayKeys.length === 0 ? (
            <Text style={[styles.noOne, { color: theme.textSecondary }]}>{t("duty.rosterNoShiftsDay", lang)}</Text>
          ) : (
            visibleDayKeys.map((k) => (
              <View key={k} style={{ gap: 8 }}>
                <Text style={[styles.rosterDay, { color: theme.textTertiary }]}>{fmtDay(new Date(k), lang)}</Text>
                {(byDay.get(k) ?? []).map((s) => {
                  const isMember = s.members.some((m) => m.userId === userId);
                  return (
                    <View key={s.id} style={[styles.shiftCard, { backgroundColor: theme.backgroundTertiary }]}>
                      <Pressable
                        onPress={canManage ? () => openModal(s) : undefined}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                      >
                        <View style={styles.shiftTimeCol}>
                          <Text style={[styles.shiftTime, { color: theme.tintDark }]}>{fmtTime(new Date(s.startsAt))}</Text>
                          <Text style={[styles.shiftTimeEnd, { color: theme.textTertiary }]}>{fmtTime(new Date(s.endsAt))}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.shiftTitle, { color: theme.text }]}>{s.title}</Text>
                          {s.location ? <Text style={[styles.shiftLocation, { color: theme.textSecondary }]}>{s.location}</Text> : null}
                          <Text style={[styles.shiftMembers, { color: theme.textTertiary }]}>
                            {s.members.length > 0 ? s.members.map((m) => m.userName).join(", ") : t("duty.rosterNoMembers", lang)}
                          </Text>
                        </View>
                      </Pressable>
                      {!isMember && (
                        <Pressable
                          onPress={() => doJoin(s.id)}
                          disabled={busyShiftId !== null}
                          style={[styles.miniAction, { backgroundColor: theme.tintLight }]}
                        >
                          {busyShiftId === s.id ? (
                            <ActivityIndicator color={theme.tintDark} size="small" />
                          ) : (
                            <Text style={[styles.miniActionText, { color: theme.tintDark }]}>{t("duty.joinShift", lang)}</Text>
                          )}
                        </Pressable>
                      )}
                      {isMember && (
                        <Pressable
                          onPress={() => doLeave(s.id)}
                          disabled={busyShiftId !== null}
                          style={[styles.miniAction, { borderColor: theme.cardBorder }]}
                        >
                          <Text style={[styles.miniActionText, { color: theme.textSecondary }]}>{t("duty.leaveShift", lang)}</Text>
                        </Pressable>
                      )}
                      {canManage && (
                        <Pressable onPress={() => openModal(s)} hitSlop={8}>
                          <Ionicons name="pencil" size={16} color={theme.textTertiary} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, appleCardStyle(theme)]}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
            {t("duty.whoIsOnDuty", lang)}
          </Text>
          {listLoading ? (
            <ActivityIndicator color={theme.tint} />
          ) : onDutyUsers.length === 0 ? (
            <Text style={[styles.noOne, { color: theme.textSecondary }]}>
              {t("duty.noOneDuty", lang)}
            </Text>
          ) : (
            onDutyUsers.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <View style={[styles.avatar, { backgroundColor: theme.tintLight }]}>
                  <Text style={[styles.avatarText, { color: theme.tint }]}>
                    {(u.firstName?.[0] ?? "?").toUpperCase()}{(u.lastName?.[0] ?? "").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: theme.text }]}>
                    {u.firstName && u.lastName ? `${u.firstName.charAt(0).toUpperCase() + u.firstName.slice(1).toLowerCase()} ${u.lastName.charAt(0).toUpperCase() + u.lastName.slice(1).toLowerCase()}` : u.id.replace("iserv-", "")}
                  </Text>
                  <Text style={[styles.userRole, { color: theme.textTertiary }]}>
                    {roles.displayName(u.role, lang)}
                  </Text>
                </View>
                <View style={[styles.onDutyPip, { backgroundColor: theme.tint }]} />
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, appleCardStyle(theme)]}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("duty.notes", lang)}</Text>
          {[t("duty.hint1", lang), t("duty.hint2", lang), t("duty.hint3", lang)].map((hint) => (
            <View key={hint} style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textTertiary} />
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>{hint}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {modal && (
        <ShiftModal
          shift={modal.shift}
          defaultDate={weekStart}
          paramedics={paramedics}
          lang={lang}
          theme={theme}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            moveWeek(0);
          }}
          onDeleted={() => {
            setModal(null);
            moveWeek(0);
          }}
        />
      )}

      {emergencyOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEmergencyOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.emergencyCard, { backgroundColor: theme.card, borderColor: theme.danger }]}>
              <View style={[styles.emergencyBadge, { backgroundColor: theme.danger + "1A" }]}>
                <Ionicons name="warning" size={26} color={theme.danger} />
              </View>
              <Text style={[styles.emergencyTitle, { color: theme.text }]}>{t("emergency.callConfirm", lang)}</Text>
              <Text style={[styles.emergencyBody, { color: theme.textSecondary }]}>{t("emergency.callBody", lang)}</Text>
              <Pressable
                onPress={dialEmergency}
                style={({ pressed }) => [styles.emergencyCallBtn, { backgroundColor: theme.danger, opacity: pressed ? 0.85 : 1 }]}
              >
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.emergencyCallBtnText}>{t("emergency.callNow", lang)}</Text>
              </Pressable>
              <Pressable onPress={() => setEmergencyOpen(false)} style={[styles.emergencyCancelBtn, { borderColor: theme.cardBorder }]}>
                <Text style={[styles.emergencyCancelText, { color: theme.textSecondary }]}>{t("emergency.cancel", lang)}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emergencyBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emergencyText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emergencyCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 22, borderWidth: 1.5, gap: 12, alignItems: "center" },
  emergencyBadge: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  emergencyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emergencyBody: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emergencyCallBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    alignSelf: "stretch", paddingVertical: 14, borderRadius: 14,
  },
  emergencyCallBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  emergencyCancelBtn: { alignSelf: "stretch", paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  emergencyCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  toggleBtn: {
    width: 220, paddingVertical: 28, borderRadius: 24, alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 6,
  },
  toggleBtnLabel: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  toggleBtnHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, width: "100%" },
  statusText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  section: { width: "100%", padding: 16, gap: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noOne: { fontSize: 14, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  onDutyPip: { width: 8, height: 8, borderRadius: 4 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  rosterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  rosterWeekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  weekNav: { padding: 6 },
  rosterWeekLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rosterDay: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize", marginTop: 4 },
  weekRow: { flexDirection: "row", gap: 8 },
  weekCell: {
    flex: 1, alignItems: "center", gap: 3,
    paddingVertical: 10, borderRadius: 14, borderWidth: 1,
  },
  weekCellDay: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  weekCellDate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  weekCellNames: { fontSize: 9.5, fontFamily: "Inter_500Medium", textAlign: "center", paddingHorizontal: 3, lineHeight: 12 },
  weekCellOpen: { fontSize: 9.5, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  vertretungCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  vertretungTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  vertretungDesc: { fontSize: 12.5, fontFamily: "Inter_400Regular" },
  vertretungRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  joinBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, minWidth: 110, alignItems: "center" },
  joinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  filterReset: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  miniAction: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  miniActionText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  shiftCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 14,
  },
  shiftTimeCol: { alignItems: "flex-start", minWidth: 48 },
  shiftTime: { fontSize: 15, fontFamily: "Inter_700Bold" },
  shiftTimeEnd: { fontSize: 12, fontFamily: "Inter_400Regular" },
  shiftTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  shiftLocation: { fontSize: 13, fontFamily: "Inter_400Regular" },
  shiftMembers: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, borderWidth: 1, gap: 14 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  inputWrap: { padding: 12, borderRadius: 12, borderWidth: 1 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  inputText: { fontSize: 15, fontFamily: "Inter_500Medium", padding: 0 },
  timeRow: { flexDirection: "row", gap: 12 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  memberChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalError: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalSave: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  modalSaveText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  modalDelete: { paddingVertical: 12, borderRadius: 14, alignItems: "center", borderWidth: 1 },
  modalDeleteText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalCancel: { paddingVertical: 12, borderRadius: 14, alignItems: "center", borderWidth: 1 },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
