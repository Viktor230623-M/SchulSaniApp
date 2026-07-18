import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type {
  AvpuScore,
  IncidentOutcome,
  IncidentReport,
  PatientType,
} from "@/models";
import { CATEGORY_SUGGESTIONS, MEASURE_SUGGESTIONS } from "@/models";
import ChipTextField from "@/components/ChipTextField";
import BodyMap, { BODY_REGION_KEYS } from "@/components/BodyMap";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";



const OUTCOMES: IncidentOutcome[] = [
  "back_to_class", "rest_then_return", "sent_home", "picked_up_by_parents",
  "family_doctor", "ambulance_112", "hospital", "other",
];



const PATIENT_TYPES: PatientType[] = ["student", "teacher", "visitor", "other"];
const AVPU: AvpuScore[] = ["A", "V", "P", "U"];

const LEADERSHIP_ROLES = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin"];

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { id, missionId: paramMissionId, location: paramLocation } = useLocalSearchParams<{
    id: string;
    missionId?: string;
    location?: string;
  }>();

  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const user = useAppStore((s) => s.user);
  const theme = getTheme(themeKey);
  const isNew = id === "new";
  const isLeadership = LEADERSHIP_ROLES.includes(user?.role ?? "");
  const showPatient = LEADERSHIP_ROLES.includes(user?.role ?? "") || user?.role === "teacher";

  const [report, setReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addendumText, setAddendumText] = useState("");
  const [addingAddendum, setAddingAddendum] = useState(false);
  const [showAddendum, setShowAddendum] = useState(false);
  const [vitalsExpanded, setVitalsExpanded] = useState(false);

  // Form state
  const [patientType, setPatientType] = useState<PatientType | null>(null);
  const [patientFirstName, setPatientFirstName] = useState("");
  const [patientLastName, setPatientLastName] = useState("");
  const [patientClass, setPatientClass] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [location, setLocation] = useState(paramLocation ?? "");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [injurySites, setInjurySites] = useState("");
  const [measures, setMeasures] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [pulseBpm, setPulseBpm] = useState("");
  const [spo2, setSpo2] = useState("");
  const [respRate, setRespRate] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [avpu, setAvpu] = useState<AvpuScore | null>(null);
  const [painScore, setPainScore] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<IncidentOutcome | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [witnesses, setWitnesses] = useState("");

  const missionId = paramMissionId ?? (report?.missionId ?? null);
  const isLocked = report?.status === "submitted";
  const isAuthor = report?.authorId === user?.id;
  const canEdit = !isLocked && (isNew || isAuthor || isLeadership);

  useEffect(() => {
    if (!isNew) loadReport();
  }, [id]);

  async function loadReport() {
    try {
      const r = await ApiService.getIncidentReport(id);
      setReport(r);
      setPatientType(r.patientType ?? null);
      setPatientFirstName(r.patientFirstName ?? "");
      setPatientLastName(r.patientLastName ?? "");
      setPatientClass(r.patientClass ?? "");
      setPatientAge(r.patientAge ? String(r.patientAge) : "");
      setEmergencyContactName(r.emergencyContactName ?? "");
      setEmergencyContactPhone(r.emergencyContactPhone ?? "");
      setLocation(r.location ?? "");
      setCategory(r.category ?? "");
      setDescription(r.description ?? "");
      setInjurySites(r.injurySites ?? "");
      setMeasures(r.measures ?? "");
      setTreatmentNotes(r.treatmentNotes ?? "");
      setPulseBpm(r.pulseBpm ? String(r.pulseBpm) : "");
      setSpo2(r.spo2 ? String(r.spo2) : "");
      setRespRate(r.respRate ? String(r.respRate) : "");
      setBloodPressure(r.bloodPressure ?? "");
      setAvpu(r.consciousnessAvpu ?? null);
      setPainScore(r.painScore ?? null);
      setOutcome(r.outcome ?? null);
      setOutcomeNotes(r.outcomeNotes ?? "");
      setWitnesses(r.witnesses ?? "");
      if (r.pulseBpm || r.spo2 || r.respRate || r.bloodPressure || r.consciousnessAvpu || r.painScore !== null) {
        setVitalsExpanded(true);
      }
    } catch (e) {
      Alert.alert(t("common.error", lang), String(e));
    } finally {
      setLoading(false);
    }
  }

  function buildPayload() {
    return {
      missionId: missionId ?? undefined,
      patientType: patientType ?? undefined,
      patientFirstName: patientFirstName.trim() || undefined,
      patientLastName: patientLastName.trim() || undefined,
      patientClass: patientClass.trim() || undefined,
      patientAge: patientAge ? parseInt(patientAge, 10) : undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      location: location.trim() || undefined,
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      injurySites: injurySites.trim() || undefined,
      measures: measures.trim() || undefined,
      treatmentNotes: treatmentNotes.trim() || undefined,
      pulseBpm: pulseBpm ? parseInt(pulseBpm, 10) : undefined,
      spo2: spo2 ? parseInt(spo2, 10) : undefined,
      respRate: respRate ? parseInt(respRate, 10) : undefined,
      bloodPressure: bloodPressure.trim() || undefined,
      consciousnessAvpu: avpu ?? undefined,
      painScore: painScore ?? undefined,
      outcome: outcome ?? undefined,
      outcomeNotes: outcomeNotes.trim() || undefined,
      witnesses: witnesses.trim() || undefined,
    };
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const payload = buildPayload();
      if (isNew) {
        const r = await ApiService.createIncidentReport(payload);
        setReport(r);
        router.replace(`/report/${r.id}`);
      } else {
        const r = await ApiService.updateIncidentReport(id, payload);
        setReport(r);
      }
    } catch (e) {
      Alert.alert(t("common.error", lang), String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!category.trim()) { Alert.alert(t("common.error", lang), t("report.categoryRequired", lang)); return; }
    if (!outcome) { Alert.alert(t("common.error", lang), t("report.outcomeRequired", lang)); return; }

    Alert.alert(t("report.submitConfirm", lang), t("report.submitConfirmDesc", lang), [
      { text: t("common.cancel", lang), style: "cancel" },
      {
        text: t("report.submit", lang),
        style: "destructive",
        onPress: async () => {
          setSubmitting(true);
          try {
            // Save current state first, then submit
            let reportId = id;
            if (isNew) {
              const r = await ApiService.createIncidentReport(buildPayload());
              reportId = r.id;
            } else {
              await ApiService.updateIncidentReport(id, buildPayload());
            }
            const r = await ApiService.submitIncidentReport(reportId);
            setReport(r);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (!isNew) loadReport();
            else router.replace(`/report/${reportId}`);
          } catch (e) {
            Alert.alert(t("common.error", lang), String(e));
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  async function handleSharePdf() {
    try {
      const url = ApiService.getReportPdfUrl(report!.id, lang);
      if (Platform.OS === "web") {
        (window as any).open(url, "_blank");
        return;
      }
      const dest = `${FileSystem.cacheDirectory}report-${report!.id.slice(0, 8)}.pdf`;
      const { uri } = await FileSystem.downloadAsync(url, dest);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
      }
    } catch (e) {
      Alert.alert(t("common.error", lang), String(e));
    }
  }

  async function handleAddAddendum() {
    if (!addendumText.trim()) return;
    setAddingAddendum(true);
    try {
      const r = await ApiService.addReportAddendum(report!.id, addendumText.trim());
      setReport(r);
      setAddendumText("");
      setShowAddendum(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert(t("common.error", lang), String(e));
    } finally {
      setAddingAddendum(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      </View>
    );
  }

  const sectionLabel = (label: string) => (
    <Text style={[styles.sectionLabel, { color: theme.tint, borderBottomColor: theme.tint + "30" }]}>
      {label}
    </Text>
  );

  const chipRow = <T extends string>(
    items: T[],
    selected: T | T[] | null,
    onPress: (item: T) => void,
    labelFn: (item: T) => string,
    multi = false
  ) => {
    const isSelected = (item: T) =>
      multi ? (selected as T[])?.includes(item) : selected === item;
    return (
      <View style={styles.chipWrap}>
        {items.map((item) => (
          <Pressable
            key={item}
            onPress={() => { if (canEdit) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(item); } }}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected(item) ? theme.tint : theme.card,
                borderColor: isSelected(item) ? theme.tint : theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: isSelected(item) ? "#fff" : theme.textSecondary }]}>
              {labelFn(item)}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: {
    placeholder?: string; keyboardType?: "numeric" | "default" | "phone-pad"; multiline?: boolean;
  }) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          opts?.multiline && styles.inputMulti,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            color: theme.text,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={opts?.placeholder ?? ""}
        placeholderTextColor={theme.textTertiary}
        keyboardType={opts?.keyboardType ?? "default"}
        multiline={opts?.multiline}
        editable={canEdit}
      />
    </View>
  );

  const tReport = (key: string) => {
    const val = t(`report.${key}`, lang);
    return val;
  };

  const getOutcomeLabel = (o: IncidentOutcome) => t(`report.outcomes.${o}`, lang);
  const getPatientTypeLabel = (p: PatientType) => t(`report.patientTypes.${p}`, lang);
  const getBodyRegionLabel = (key: string) => t(`report.bodyRegions.${key}`, lang);

  const categoryChips = CATEGORY_SUGGESTIONS.map((k) => ({
    key: k,
    label: t(`report.categories.${k}`, lang),
  }));
  const measureChips = MEASURE_SUGGESTIONS.map((k) => ({
    key: k,
    label: t(`report.measureLabels.${k}`, lang),
  }));
  const bodyRegionChips = BODY_REGION_KEYS.map((k) => ({
    key: k,
    label: getBodyRegionLabel(k),
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 4,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {isNew
              ? (missionId ? tReport("title") : tReport("walkinTitle"))
              : (report?.missionId ? tReport("title") : tReport("walkinTitle"))}
          </Text>
          {report && !isLocked && (
            <View style={[styles.statusBadge, { backgroundColor: theme.tintLight }]}>
              <Text style={[styles.statusBadgeText, { color: theme.tint }]}>{tReport("draft")}</Text>
            </View>
          )}
          {report && isLocked && (
            <View style={[styles.statusBadge, { backgroundColor: "#22C55E20" }]}>
              <Text style={[styles.statusBadgeText, { color: "#22C55E" }]}>{tReport("submitted")}</Text>
            </View>
          )}
        </View>

        {isLocked && (
          <View style={[styles.lockedBanner, { backgroundColor: "#22C55E15", borderColor: "#22C55E40" }]}>
            <Ionicons name="lock-closed" size={14} color="#22C55E" />
            <Text style={[styles.lockedText, { color: "#22C55E" }]}>{tReport("lockedNotice")}</Text>
          </View>
        )}

        {/* PDF + Addendum actions for submitted reports */}
        {isLocked && report && (
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleSharePdf}
              style={[styles.actionBtn, { backgroundColor: theme.tint }]}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{tReport("sharePdf")}</Text>
            </Pressable>
            {(isAuthor || isLeadership) && (
              <Pressable
                onPress={() => setShowAddendum(true)}
                style={[styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder, borderWidth: 1 }]}
              >
                <Ionicons name="add-circle-outline" size={16} color={theme.tint} />
                <Text style={[styles.actionBtnText, { color: theme.tint }]}>{tReport("addAddendum")}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Addendum input */}
        {showAddendum && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.text, borderBottomColor: theme.cardBorder }]}>
              {tReport("addendumTitle")}
            </Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: theme.background, borderColor: theme.cardBorder, color: theme.text }]}
              value={addendumText}
              onChangeText={setAddendumText}
              placeholder={tReport("addendumPlaceholder")}
              placeholderTextColor={theme.textTertiary}
              multiline
            />
            <View style={styles.rowBtns}>
              <Pressable onPress={() => setShowAddendum(false)} style={[styles.cancelBtn, { borderColor: theme.cardBorder }]}>
                <Text style={{ color: theme.textSecondary }}>{t("common.cancel", lang)}</Text>
              </Pressable>
              <Pressable onPress={handleAddAddendum} disabled={addingAddendum} style={[styles.submitBtn, { backgroundColor: theme.tint }]}>
                {addingAddendum ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>{t("common.save", lang)}</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {/* Section: Patient */}
        {showPatient && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {sectionLabel(tReport("sectionPatient"))}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("patientType")}</Text>
            {chipRow(PATIENT_TYPES, patientType, (p) => setPatientType(patientType === p ? null : p), getPatientTypeLabel)}
            {field(tReport("patientFirstName"), patientFirstName, setPatientFirstName)}
            {field(tReport("patientLastName"), patientLastName, setPatientLastName)}
            {field(tReport("patientClass"), patientClass, setPatientClass, { placeholder: "z.B. 10a / e.g. 10a" })}
            {field(tReport("patientAge"), patientAge, setPatientAge, { keyboardType: "numeric", placeholder: "z.B. 14" })}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 8 }]}>
              {patientType === "student" ? tReport("emergencyContactParents") : tReport("emergencyContact")}
            </Text>
            {field(tReport("emergencyContactName"), emergencyContactName, setEmergencyContactName, {
              placeholder: tReport("emergencyContactNamePlaceholder"),
            })}
            {field(tReport("emergencyContactPhone"), emergencyContactPhone, setEmergencyContactPhone, {
              keyboardType: "phone-pad",
              placeholder: "0171 1234567",
            })}
            {emergencyContactPhone.trim().length > 0 && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL(`tel:${emergencyContactPhone.replace(/[^+\d]/g, "")}`);
                }}
                style={[styles.callBtn, { borderColor: theme.tint }]}
              >
                <Ionicons name="call" size={16} color={theme.tint} />
                <Text style={[styles.callBtnText, { color: theme.tint }]}>{emergencyContactPhone.trim()}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Section: Incident */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionIncident"))}
          <ChipTextField
            label={tReport("category") + " *"}
            value={category}
            onChange={setCategory}
            suggestions={categoryChips}
            placeholder={tReport("categoryPlaceholder")}
            editable={canEdit}
          />
          {field(tReport("description"), description, setDescription, {
            placeholder: tReport("descriptionPlaceholder"),
            multiline: true,
          })}
          {field(t("common.location", lang), location, setLocation, { placeholder: "z.B. Sporthalle / Gym" })}
        </View>

        {/* Section: Injury sites */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionInjury"))}
          <BodyMap
            value={injurySites}
            onChange={setInjurySites}
            labelFor={getBodyRegionLabel}
            frontLabel={tReport("bodyFront")}
            backLabel={tReport("bodyBack")}
            editable={canEdit}
          />
          <ChipTextField
            label={tReport("injurySites")}
            value={injurySites}
            onChange={setInjurySites}
            suggestions={bodyRegionChips}
            placeholder={tReport("injurySitesPlaceholder")}
            multiline
            editable={canEdit}
          />
        </View>

        {/* Section: Vitals (collapsible) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Pressable
            onPress={() => setVitalsExpanded(!vitalsExpanded)}
            style={styles.collapsibleHeader}
          >
            <Text style={[styles.sectionLabelInline, { color: theme.tint }]}>{tReport("sectionVitals")}</Text>
            <Ionicons name={vitalsExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.tint} />
          </Pressable>
          {vitalsExpanded && (
            <View style={{ gap: 8 }}>
              {field(tReport("pulse"), pulseBpm, setPulseBpm, { keyboardType: "numeric", placeholder: "z.B. 72" })}
              {field(tReport("spo2"), spo2, setSpo2, { keyboardType: "numeric", placeholder: "z.B. 98" })}
              {field(tReport("respRate"), respRate, setRespRate, { keyboardType: "numeric", placeholder: "z.B. 16" })}
              {field(tReport("bloodPressure"), bloodPressure, setBloodPressure, { placeholder: "z.B. 120/80" })}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("consciousness")}</Text>
              {chipRow(AVPU, avpu, (a) => setAvpu(avpu === a ? null : a), (a) => a)}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("pain")} {painScore !== null ? `— ${painScore}` : ""}</Text>
              <View style={styles.painRow}>
                {Array.from({ length: 11 }, (_, i) => (
                  <Pressable
                    key={i}
                    onPress={() => { if (canEdit) setPainScore(painScore === i ? null : i); }}
                    style={[
                      styles.painBtn,
                      {
                        backgroundColor: painScore === i
                          ? i <= 3 ? "#22C55E" : i <= 6 ? "#F97316" : "#EF4444"
                          : theme.card,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.painBtnText, { color: painScore === i ? "#fff" : theme.textSecondary }]}>{i}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Section: Treatment */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionTreatment"))}
          <ChipTextField
            label={tReport("measures")}
            value={measures}
            onChange={setMeasures}
            suggestions={measureChips}
            placeholder={tReport("measuresPlaceholder")}
            editable={canEdit}
          />
          {field(tReport("treatmentNotes"), treatmentNotes, setTreatmentNotes, {
            placeholder: tReport("treatmentNotesPlaceholder"),
            multiline: true,
          })}
        </View>

        {/* Section: Outcome */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionOutcome"))}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("outcome")} *</Text>
          {chipRow(OUTCOMES, outcome, (o) => setOutcome(outcome === o ? null : o), getOutcomeLabel)}
          {field(tReport("outcomeNotes"), outcomeNotes, setOutcomeNotes, {
            placeholder: tReport("outcomeNotesPlaceholder"),
            multiline: true,
          })}
          {field(tReport("witnesses"), witnesses, setWitnesses, {
            placeholder: tReport("witnessesPlaceholder"),
          })}
        </View>

        {/* Addenda (read-only) */}
        {report?.addenda && report.addenda.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {sectionLabel(tReport("addendumTitle"))}
            {report.addenda.map((a, i) => (
              <View key={i} style={[styles.addendumItem, { borderColor: theme.cardBorder }]}>
                <Text style={[styles.addendumMeta, { color: theme.textTertiary }]}>
                  {a.authorName} — {new Date(a.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US")}
                </Text>
                <Text style={[styles.addendumBody, { color: theme.text }]}>{a.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Save / Submit buttons */}
        {canEdit && (
          <View style={styles.bottomBtns}>
            <Pressable
              onPress={handleSaveDraft}
              disabled={saving}
              style={[styles.draftBtn, { borderColor: theme.tint }]}
            >
              {saving
                ? <ActivityIndicator color={theme.tint} size="small" />
                : <Text style={[styles.draftBtnText, { color: theme.tint }]}>{tReport("saveDraft")}</Text>}
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: theme.tint }]}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>{tReport("submit")}</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
    marginBottom: 4,
  },
  callBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
    marginBottom: 8,
  },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  lockedText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  sectionLabelInline: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flex: 1,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
  },
  fieldWrap: { gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  painRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  painBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  painBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  addendumItem: { paddingTop: 8, borderTopWidth: 1, gap: 4 },
  addendumMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  addendumBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  rowBtns: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  bottomBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  draftBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
