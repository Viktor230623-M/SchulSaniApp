import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import React, { useEffect, useRef, useState } from "react";
import {
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

import { useTopPad } from "@/hooks/useTopPad";
import { GlassLoader } from "@/components/GlassLoader";
import { t } from "@/constants/i18n";
import { getTheme, istDunklesThema } from "@/constants/theme";
import type {
  AvpuScore,
  IncidentOutcome,
  IncidentReport,
  PatientType,
} from "@/models";
import { CATEGORY_SUGGESTIONS, MEASURE_SUGGESTIONS } from "@/models";
import ChipTextField from "@/components/ChipTextField";
import BodyMap, { BODY_REGION_KEYS } from "@/components/BodyMap";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import {
  clearIncidentDraft,
  loadIncidentDraft,
  saveIncidentDraft,
} from "@/services/incidentDraftStore";
import { toBase64 } from "@/services/crypto/encoding";
import { renderReportPdf, type DecryptedReport } from "@/services/reportPdfClient";
import { has, useAppStore } from "@/store/useAppStore";



const OUTCOMES: IncidentOutcome[] = [
  "back_to_class", "rest_then_return", "sent_home", "picked_up_by_parents",
  "family_doctor", "ambulance_112", "hospital", "other",
];



const PATIENT_TYPES: PatientType[] = ["student", "teacher", "visitor", "other"];
const AVPU: AvpuScore[] = ["A", "V", "P", "U"];

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
  const isLeadership = has("reports.read_all");
  const showPatient = has("reports.see_patient_info");

  const [report, setReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addendumText, setAddendumText] = useState("");
  const [addingAddendum, setAddingAddendum] = useState(false);
  const [showAddendum, setShowAddendum] = useState(false);
  const [vitalsExpanded, setVitalsExpanded] = useState(false);
  const [clientDraftId, setClientDraftId] = useState(() => isNew ? Crypto.randomUUID() : "");
  const [localDraftStatus, setLocalDraftStatus] = useState<"restored" | "error" | null>(null);
  const hydratedRef = useRef(false);

  // Form state
  const [reportTitle, setReportTitle] = useState("");
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
  // Patient (Ergaenzungen zum Papierprotokoll)
  const [patientSex, setPatientSex] = useState("");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [teacherName, setTeacherName] = useState("");
  // Erstbefund A–E
  const [breathing, setBreathing] = useState("");
  const [skinColor, setSkinColor] = useState("");
  const [pulseRegular, setPulseRegular] = useState("");
  const [orientation, setOrientation] = useState("");
  const [pupilsLeft, setPupilsLeft] = useState("");
  const [pupilsRight, setPupilsRight] = useState("");
  const [pupilReaction, setPupilReaction] = useState("");
  // Befragung
  const [complaintHistory, setComplaintHistory] = useState("");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  // Verlauf (Wiederholungsmessungen)
  const [recheckTime2, setRecheckTime2] = useState("");
  const [recheckPulse2, setRecheckPulse2] = useState("");
  const [recheckRegular2, setRecheckRegular2] = useState("");
  const [recheckTime3, setRecheckTime3] = useState("");
  const [recheckPulse3, setRecheckPulse3] = useState("");
  const [recheckRegular3, setRecheckRegular3] = useState("");
  const [progressNotes, setProgressNotes] = useState("");
  // Entlassung / Uebergabe
  const [leadingSymptom, setLeadingSymptom] = useState("");
  const [handoverProperty, setHandoverProperty] = useState("");
  const [accompaniedBy, setAccompaniedBy] = useState("");
  // Unterschriften (bis zu drei Einsatzkraefte)
  const [signatures, setSignatures] = useState<string[]>(["", "", ""]);

  const missionId = paramMissionId ?? (report?.missionId ?? null);
  const isLocked = report?.status === "submitted";
  const isAuthor = report?.authorId === user?.id;
  const canEdit = !isLocked && (isNew || isAuthor || isLeadership);

  function applyDraft(payload: Partial<IncidentReport>) {
    setReportTitle(payload.title ?? "");
    setPatientType(payload.patientType ?? null);
    setPatientFirstName(payload.patientFirstName ?? "");
    setPatientLastName(payload.patientLastName ?? "");
    setPatientClass(payload.patientClass ?? "");
    setPatientAge(payload.patientAge == null ? "" : String(payload.patientAge));
    setPatientSex(payload.patientSex ?? "");
    setPatientBirthDate(payload.patientBirthDate ?? "");
    setTeacherName(payload.teacherName ?? "");
    setEmergencyContactName(payload.emergencyContactName ?? "");
    setEmergencyContactPhone(payload.emergencyContactPhone ?? "");
    setLocation(payload.location ?? "");
    setCategory(payload.category ?? "");
    setDescription(payload.description ?? "");
    setInjurySites(payload.injurySites ?? "");
    setMeasures(payload.measures ?? "");
    setTreatmentNotes(payload.treatmentNotes ?? "");
    setBreathing(payload.breathing ?? "");
    setSkinColor(payload.skinColor ?? "");
    setPulseRegular(payload.pulseRegular ?? "");
    setOrientation(payload.orientation ?? "");
    setPupilsLeft(payload.pupilsLeft ?? "");
    setPupilsRight(payload.pupilsRight ?? "");
    setPupilReaction(payload.pupilReaction ?? "");
    setComplaintHistory(payload.complaintHistory ?? "");
    setMedications(payload.medications ?? "");
    setAllergies(payload.allergies ?? "");
    setRecheckTime2(payload.recheckTime2 ?? "");
    setRecheckPulse2(payload.recheckPulse2 == null ? "" : String(payload.recheckPulse2));
    setRecheckRegular2(payload.recheckRegular2 ?? "");
    setRecheckTime3(payload.recheckTime3 ?? "");
    setRecheckPulse3(payload.recheckPulse3 == null ? "" : String(payload.recheckPulse3));
    setRecheckRegular3(payload.recheckRegular3 ?? "");
    setProgressNotes(payload.progressNotes ?? "");
    setLeadingSymptom(payload.leadingSymptom ?? "");
    setHandoverProperty(payload.handoverProperty ?? "");
    setAccompaniedBy(payload.accompaniedBy ?? "");
    if (Array.isArray(payload.signatures)) {
      const sigs = (payload.signatures as unknown[]).filter((s): s is string => typeof s === "string");
      setSignatures([sigs[0] ?? "", sigs[1] ?? "", sigs[2] ?? ""]);
    }
    setPulseBpm(payload.pulseBpm == null ? "" : String(payload.pulseBpm));
    setSpo2(payload.spo2 == null ? "" : String(payload.spo2));
    setRespRate(payload.respRate == null ? "" : String(payload.respRate));
    setBloodPressure(payload.bloodPressure ?? "");
    setAvpu(payload.consciousnessAvpu ?? null);
    setPainScore(payload.painScore ?? null);
    setOutcome(payload.outcome ?? null);
    setOutcomeNotes(payload.outcomeNotes ?? "");
    setWitnesses(payload.witnesses ?? "");
    const savedClientDraftId = (payload as { clientDraftId?: unknown }).clientDraftId;
    if (typeof savedClientDraftId === "string" && savedClientDraftId) {
      setClientDraftId(savedClientDraftId);
    }
  }

  async function restoreLocalDraft(reportId: string): Promise<boolean> {
    if (!user?.id) return false;
    const draft = await loadIncidentDraft(user.id, reportId);
    if (!draft) return false;
    applyDraft(draft.payload);
    setLocalDraftStatus("restored");
    return true;
  }

  useEffect(() => {
    hydratedRef.current = false;
    let cancelled = false;
    (async () => {
      if (isNew) {
        try {
          if (!cancelled) await restoreLocalDraft("new");
        } catch (e) {
          if (!cancelled) setLocalDraftStatus("error");
        } finally {
          if (!cancelled) hydratedRef.current = true;
        }
        return;
      }
      await loadReport();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  async function loadReport() {
    try {
      const r = await ApiService.getIncidentReport(id);
      setReport(r);
      applyDraft(r);
      if (r.pulseBpm || r.spo2 || r.respRate || r.bloodPressure || r.consciousnessAvpu || r.painScore !== null) {
        setVitalsExpanded(true);
      }
      if (r.status === "submitted") {
        if (user?.id) await clearIncidentDraft(user.id, id).catch(() => {});
      } else {
        await restoreLocalDraft(id);
      }
    } catch (e) {
      notify(t("common.error", lang), String(e));
    } finally {
      setLoading(false);
      hydratedRef.current = true;
    }
  }

  function buildPayload() {
    return {
      updatedAt: report?.updatedAt,
      clientDraftId: isNew ? clientDraftId : undefined,
      missionId: missionId ?? undefined,
      title: reportTitle.trim() || undefined,
      patientType: patientType ?? undefined,
      patientFirstName: patientFirstName.trim() || undefined,
      patientLastName: patientLastName.trim() || undefined,
      patientClass: patientClass.trim() || undefined,
      patientAge: patientAge ? parseInt(patientAge, 10) : undefined,
      patientSex: patientSex.trim() || undefined,
      patientBirthDate: patientBirthDate.trim() || undefined,
      teacherName: teacherName.trim() || undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      location: location.trim() || undefined,
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      injurySites: injurySites.trim() || undefined,
      measures: measures.trim() || undefined,
      treatmentNotes: treatmentNotes.trim() || undefined,
      breathing: breathing.trim() || undefined,
      skinColor: skinColor.trim() || undefined,
      pulseRegular: pulseRegular.trim() || undefined,
      orientation: orientation.trim() || undefined,
      pupilsLeft: pupilsLeft.trim() || undefined,
      pupilsRight: pupilsRight.trim() || undefined,
      pupilReaction: pupilReaction.trim() || undefined,
      complaintHistory: complaintHistory.trim() || undefined,
      medications: medications.trim() || undefined,
      allergies: allergies.trim() || undefined,
      recheckTime2: recheckTime2.trim() || undefined,
      recheckPulse2: recheckPulse2 ? parseInt(recheckPulse2, 10) : undefined,
      recheckRegular2: recheckRegular2.trim() || undefined,
      recheckTime3: recheckTime3.trim() || undefined,
      recheckPulse3: recheckPulse3 ? parseInt(recheckPulse3, 10) : undefined,
      recheckRegular3: recheckRegular3.trim() || undefined,
      progressNotes: progressNotes.trim() || undefined,
      leadingSymptom: leadingSymptom.trim() || undefined,
      handoverProperty: handoverProperty.trim() || undefined,
      accompaniedBy: accompaniedBy.trim() || undefined,
      signatures: signatures.map((s) => s.trim()).filter(Boolean).length > 0 ? signatures.map((s) => s.trim()).filter(Boolean) : undefined,
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

  async function persistLocalDraft() {
    if (!user?.id || isLocked) return;
    await saveIncidentDraft(user.id, id, buildPayload());
  }

  useEffect(() => {
    if (!hydratedRef.current || !canEdit || !user?.id) return;
    const timer = setTimeout(() => {
      persistLocalDraft().catch(() => setLocalDraftStatus("error"));
    }, 250);
    return () => clearTimeout(timer);
  }, [
    canEdit,
    category,
    description,
    emergencyContactName,
    emergencyContactPhone,
    injurySites,
    location,
    measures,
    outcome,
    outcomeNotes,
    painScore,
    patientAge,
    patientClass,
    patientFirstName,
    patientLastName,
    patientType,
    pulseBpm,
    reportTitle,
    respRate,
    spo2,
    treatmentNotes,
    user?.id,
    witnesses,
    avpu,
    patientSex,
    patientBirthDate,
    teacherName,
    breathing,
    skinColor,
    pulseRegular,
    orientation,
    pupilsLeft,
    pupilsRight,
    pupilReaction,
    complaintHistory,
    medications,
    allergies,
    recheckTime2,
    recheckPulse2,
    recheckRegular2,
    recheckTime3,
    recheckPulse3,
    recheckRegular3,
    progressNotes,
    leadingSymptom,
    handoverProperty,
    accompaniedBy,
    signatures,
  ]);

  async function handleSaveDraft() {
    setSaving(true);
    let localSaved = false;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await persistLocalDraft();
      localSaved = true;
      const payload = buildPayload();
      if (isNew) {
        const r = await ApiService.createIncidentReport(payload);
        if (user?.id) await clearIncidentDraft(user.id, "new").catch(() => {});
        setReport(r);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/report/${r.id}`);
      } else {
        const r = await ApiService.updateIncidentReport(id, payload);
        if (user?.id) await clearIncidentDraft(user.id, id).catch(() => {});
        setReport(r);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setLocalDraftStatus(null);
      await notify(t("report.draftSaved", lang));
    } catch (e) {
      notify(
        t("common.error", lang),
        `${String(e)}${localSaved ? `\n\n${t("report.offlineDraftSaved", lang)}` : ""}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!category.trim()) { notify(t("common.error", lang), t("report.categoryRequired", lang)); return; }
    if (!outcome) { notify(t("common.error", lang), t("report.outcomeRequired", lang)); return; }

    const confirmed = await confirmAction({
      title: t("report.submitConfirm", lang),
      message: t("report.submitConfirmDesc", lang),
      confirmLabel: t("report.submit", lang),
      cancelLabel: t("common.cancel", lang),
      destructive: true,
    });
    if (!confirmed) return;

    setSubmitting(true);
    let localSaved = false;
    try {
      await persistLocalDraft();
      localSaved = true;
      let reportId = id;
      let alreadySubmitted = false;
      if (isNew) {
        const created = await ApiService.createIncidentReport(buildPayload());
        reportId = created.id;
        alreadySubmitted = created.status === "submitted";
      } else {
        await ApiService.updateIncidentReport(id, buildPayload());
      }
      const r = alreadySubmitted ? await ApiService.getIncidentReport(reportId) : await ApiService.submitIncidentReport(reportId);
      if (user?.id) await clearIncidentDraft(user.id, isNew ? "new" : id).catch(() => {});
      setReport(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await notify(t("report.submitSuccess", lang));
      if (!isNew) loadReport();
      else router.replace(`/report/${reportId}`);
    } catch (e) {
      await notify(
        t("common.error", lang),
        `${String(e)}${localSaved ? `\n\n${t("report.offlineDraftSaved", lang)}` : ""}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSharePdf() {
    try {
      // Das PDF entsteht im Client aus dem bereits entschluesselten Inhalt --
      // der Server sieht nur Chiffrat und kann keine PDFs mehr bauen.
      const current = report ?? (await ApiService.getIncidentReport(id));
      const bytes = await renderReportPdf(current as DecryptedReport, lang);
      const filename = `Einsatzprotokoll-${current.id.slice(0, 8)}.pdf`;

      if (Platform.OS === "web") {
        const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        return;
      }

      // cacheDirectory ist app-privat und wird weder in iCloud gespiegelt
      // noch mit anderen Geraeten synchronisiert. Das PDF verlaesst das Geraet
      // nur ueber das Teilen-Menue und wird nie zum Server hochgeladen.
      const dest = new File(Paths.cache, filename);
      dest.write(toBase64(bytes), { encoding: "base64" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest.uri, { mimeType: "application/pdf" });
      }
    } catch (e) {
      notify(t("common.error", lang), String(e));
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
      notify(t("common.error", lang), String(e));
    } finally {
      setAddingAddendum(false);
    }
  }

  const topPad = useTopPad();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <GlassLoader size={140} color={theme.tint} dark={istDunklesThema(theme.background)} />
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

  // Titel des Protokolls: bei Einsaetzen der Missionstitel, sonst der
  // eingegebene Name; ganz ohne Titel bleibt der generische Platzhalter.
  const displayTitle = missionId
    ? (report?.missionTitle ?? tReport("title"))
    : (reportTitle.trim() || null);

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
  const sexOptions = ["female", "male", "diverse", "unspecified"].map((k) => ({ key: k, label: t(`report.sexes.${k}`, lang) }));
  const breathingOptions = ["spontaneous", "respiratory_distress", "hyperventilation", "apnea"].map((k) => ({ key: k, label: t(`report.breathingOptions.${k}`, lang) }));
  const skinColorOptions = ["normal", "pale", "flushed", "bluish"].map((k) => ({ key: k, label: t(`report.skinColors.${k}`, lang) }));
  const pulseRegularOptions = ["regular", "irregular"].map((k) => ({ key: k, label: t(`report.pulseRegularOptions.${k}`, lang) }));
  const orientationOptions = ["responsive", "person", "place", "time"].map((k) => ({ key: k, label: t(`report.orientationOptions.${k}`, lang) }));
  const pupilSizeOptions = ["constricted", "normal", "dilated"].map((k) => ({ key: k, label: t(`report.pupilSizes.${k}`, lang) }));
  const pupilReactionOptions = ["normal", "sluggish", "absent"].map((k) => ({ key: k, label: t(`report.pupilReactions.${k}`, lang) }));
  const propertyOptions = ["jacket", "bag", "other"].map((k) => ({ key: k, label: t(`report.propertyOptions.${k}`, lang) }));

  // Mehrfachauswahl als Komma-Liste (wie injurySites/measures).
  const toggleInList = (list: string, item: string) => {
    const parts = list.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = parts.indexOf(item);
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(item);
    return parts.join(", ");
  };

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
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {displayTitle ? `${tReport("protocolPrefix")} ${displayTitle}` : tReport("walkinTitle")}
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

        {/* Disclaimer: keine medizinische Anleitung, Notruf-Hinweis */}
        <View style={[styles.disclaimerCard, { backgroundColor: theme.backgroundTertiary, borderColor: theme.cardBorder }]}>
          <Ionicons name="medical" size={16} color={theme.tint} />
          <Text style={[styles.disclaimerText, { color: theme.textSecondary }]}>{tReport("disclaimer")}</Text>
        </View>

        {localDraftStatus && (
          <View style={[styles.disclaimerCard, { backgroundColor: localDraftStatus === "error" ? theme.danger + "14" : theme.tintLight, borderColor: theme.cardBorder }]}>
            <Ionicons
              name={localDraftStatus === "error" ? "alert-circle-outline" : "cloud-done-outline"}
              size={16}
              color={localDraftStatus === "error" ? theme.danger : theme.tint}
            />
            <Text style={[styles.disclaimerText, { color: localDraftStatus === "error" ? theme.danger : theme.textSecondary }]}>
              {t(localDraftStatus === "error" ? "report.draftSaveFailed" : "report.draftRestored", lang)}
            </Text>
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

        {/* Name only for walk-in reports (no mission) */}
        {!missionId && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {field(tReport("walkinName"), reportTitle, setReportTitle, {
              placeholder: tReport("walkinNamePlaceholder"),
            })}
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
            {field(tReport("patientClass"), patientClass, setPatientClass, { placeholder: tReport("placeholders.patientClass") })}
            {field(tReport("patientAge"), patientAge, setPatientAge, { keyboardType: "numeric", placeholder: tReport("placeholders.patientAge") })}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("patientSex")}</Text>
            {chipRow(sexOptions.map((o) => o.key), patientSex, (k) => setPatientSex(patientSex === k ? "" : k), (k) => sexOptions.find((o) => o.key === k)?.label ?? k)}
            {field(tReport("patientBirthDate"), patientBirthDate, setPatientBirthDate, { placeholder: tReport("placeholders.patientBirthDate") })}
            {field(tReport("teacherName"), teacherName, setTeacherName, { placeholder: tReport("placeholders.teacherName") })}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 8 }]}>
              {patientType === "student" ? tReport("emergencyContactParents") : tReport("emergencyContact")}
            </Text>
            {field(tReport("emergencyContactName"), emergencyContactName, setEmergencyContactName, {
              placeholder: tReport("emergencyContactNamePlaceholder"),
            })}
            {field(tReport("emergencyContactPhone"), emergencyContactPhone, setEmergencyContactPhone, {
              keyboardType: "phone-pad",
              placeholder: tReport("placeholders.phone"),
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
          {field(t("common.location", lang), location, setLocation, { placeholder: tReport("placeholders.location") })}
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

        {/* Section: Erstbefund (A–E) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionAssessment"))}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("breathing")}</Text>
          {chipRow(breathingOptions.map((o) => o.key), breathing, (k) => setBreathing(breathing === k ? "" : k), (k) => breathingOptions.find((o) => o.key === k)?.label ?? k)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("skinColor")}</Text>
          {chipRow(skinColorOptions.map((o) => o.key), skinColor, (k) => setSkinColor(skinColor === k ? "" : k), (k) => skinColorOptions.find((o) => o.key === k)?.label ?? k)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("pulseRegularity")}</Text>
          {chipRow(pulseRegularOptions.map((o) => o.key), pulseRegular, (k) => setPulseRegular(pulseRegular === k ? "" : k), (k) => pulseRegularOptions.find((o) => o.key === k)?.label ?? k)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("orientationLabel")}</Text>
          {chipRow(orientationOptions.map((o) => o.key), orientation, (k) => setOrientation(orientation === k ? "" : k), (k) => orientationOptions.find((o) => o.key === k)?.label ?? k)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("pupils")}</Text>
          <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 130, gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>{tReport("pupilLeft")}</Text>
              {chipRow(pupilSizeOptions.map((o) => o.key), pupilsLeft, (k) => setPupilsLeft(pupilsLeft === k ? "" : k), (k) => pupilSizeOptions.find((o) => o.key === k)?.label ?? k)}
            </View>
            <View style={{ flex: 1, minWidth: 130, gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>{tReport("pupilRight")}</Text>
              {chipRow(pupilSizeOptions.map((o) => o.key), pupilsRight, (k) => setPupilsRight(pupilsRight === k ? "" : k), (k) => pupilSizeOptions.find((o) => o.key === k)?.label ?? k)}
            </View>
          </View>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("pupilReactionLabel")}</Text>
          {chipRow(pupilReactionOptions.map((o) => o.key), pupilReaction, (k) => setPupilReaction(pupilReaction === k ? "" : k), (k) => pupilReactionOptions.find((o) => o.key === k)?.label ?? k)}
        </View>

        {/* Section: Befragung */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionInterview"))}
          {field(tReport("complaintHistory"), complaintHistory, setComplaintHistory, { placeholder: tReport("descriptionPlaceholder"), multiline: true })}
          {field(tReport("medications"), medications, setMedications)}
          {field(tReport("allergies"), allergies, setAllergies)}
        </View>

        {/* Section: Verlauf */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionProgress"))}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("recheckMeasurement")} 2</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>{field(tReport("recheckTime"), recheckTime2, setRecheckTime2, { keyboardType: "default" })}</View>
            <View style={{ flex: 1 }}>{field(tReport("recheckPulse"), recheckPulse2, setRecheckPulse2, { keyboardType: "numeric" })}</View>
          </View>
          {chipRow(pulseRegularOptions.map((o) => o.key), recheckRegular2, (k) => setRecheckRegular2(recheckRegular2 === k ? "" : k), (k) => pulseRegularOptions.find((o) => o.key === k)?.label ?? k)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("recheckMeasurement")} 3</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>{field(tReport("recheckTime"), recheckTime3, setRecheckTime3)}</View>
            <View style={{ flex: 1 }}>{field(tReport("recheckPulse"), recheckPulse3, setRecheckPulse3, { keyboardType: "numeric" })}</View>
          </View>
          {chipRow(pulseRegularOptions.map((o) => o.key), recheckRegular3, (k) => setRecheckRegular3(recheckRegular3 === k ? "" : k), (k) => pulseRegularOptions.find((o) => o.key === k)?.label ?? k)}
          {field(tReport("progressNotes"), progressNotes, setProgressNotes, { placeholder: tReport("treatmentNotesPlaceholder"), multiline: true })}
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
              {field(tReport("pulse"), pulseBpm, setPulseBpm, { keyboardType: "numeric", placeholder: tReport("placeholders.pulse") })}
              {field(tReport("spo2"), spo2, setSpo2, { keyboardType: "numeric", placeholder: tReport("placeholders.spo2") })}
              {field(tReport("respRate"), respRate, setRespRate, { keyboardType: "numeric", placeholder: tReport("placeholders.respRate") })}
              {field(tReport("bloodPressure"), bloodPressure, setBloodPressure, { placeholder: tReport("placeholders.bloodPressure") })}
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
          {field(tReport("leadingSymptom"), leadingSymptom, setLeadingSymptom)}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tReport("handoverProperty")}</Text>
          <View style={styles.chipWrap}>
            {propertyOptions.map((o) => {
              const active = handoverProperty.split(",").map((s) => s.trim()).includes(o.key);
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { if (canEdit) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHandoverProperty(toggleInList(handoverProperty, o.key)); } }}
                  style={[
                    styles.chip,
                    { backgroundColor: active ? theme.tint : theme.card, borderColor: active ? theme.tint : theme.cardBorder },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? "#fff" : theme.textSecondary }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {field(tReport("accompaniedBy"), accompaniedBy, setAccompaniedBy, { placeholder: tReport("placeholders.accompaniedBy") })}
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

        {/* Section: Unterschriften */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {sectionLabel(tReport("sectionSignature"))}
          <Text style={[styles.hintText, { color: theme.textSecondary }]}>{tReport("signaturesHint")}</Text>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.sigNum, { color: theme.textTertiary }]}>{i + 1}.</Text>
              <View style={{ flex: 1 }}>
                {field(tReport("signatureLabel"), signatures[i], (v) => setSignatures((prev) => prev.map((s, j) => (j === i ? v : s))), {
                  placeholder: tReport("placeholders.signatureName"),
                })}
              </View>
            </View>
          ))}
        </View>

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
    paddingBottom: 8,
    gap: 8,
  },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", flex: 1 },
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
  disclaimerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  disclaimerText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
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
  hintText: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  sigNum: { fontSize: 14, fontFamily: "Inter_700Bold", width: 22 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  painRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  painBtn: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  painBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
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
