import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { getTheme } from "@/constants/theme";
import type { PermissionDef, RoleInfo } from "@/models";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { has, useAppStore } from "@/store/useAppStore";

/** Mirrors the server-side gate; the API is the real guard, this only hides the UI. */

const PATIENT_DATA_PERMISSIONS = new Set(["reports.see_patient_info", "reports.read_all"]);

const COLOR_CHOICES = [
  "#EF4444", "#F97316", "#F59E0B", "#22C55E", "#14B8A6",
  "#3B82F6", "#6366F1", "#A855F7", "#EC4899", "#64748B",
];

export default function RolesScreen() {
  const insets = useSafeAreaInsets();
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const topPad = useTopPad();
  const canManage = has("roles.manage");

  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  async function loadRoles() {
    try {
      const data = await ApiService.getRoles();
      setRoles(Array.isArray(data) ? data.slice().sort((a, b) => a.sortOrder - b.sortOrder) : []);
    } catch (err) {
      await notify("Fehler", err instanceof Error ? err.message : "Rollen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    loadRoles();
    ApiService.getPermissionCatalog().then(setCatalog).catch(() => {});
  }, [canManage]);

  async function toggleExpand(roleId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (expandedId === roleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(roleId);
    if (!rolePermissions[roleId]) {
      setLoadingPermissions(true);
      try {
        const perms = await ApiService.getRolePermissions(roleId);
        setRolePermissions((prev) => ({ ...prev, [roleId]: perms }));
      } catch (err) {
        await notify("Fehler", err instanceof Error ? err.message : "Berechtigungen konnten nicht geladen werden");
      } finally {
        setLoadingPermissions(false);
      }
    }
  }

  async function togglePermission(role: RoleInfo, permKey: string) {
    if (permKey === "roles.manage") return; // ueber die Oberflaeche gesperrt, siehe Katalog-Anzeige
    const current = rolePermissions[role.id] ?? [];
    const alreadyGranted = current.includes(permKey);

    if (!alreadyGranted && PATIENT_DATA_PERMISSIONS.has(permKey)) {
      const confirmed = await confirmAction({
        title: "Zugriff auf Patientendaten",
        message: `Diese Aenderung gibt der Rolle ${role.displayName} Zugriff auf Patientendaten in Einsatzprotokollen.`,
        confirmLabel: "Zugriff gewaehren",
        destructive: true,
      });
      if (!confirmed) return;
    }

    const next = alreadyGranted ? current.filter((p) => p !== permKey) : [...current, permKey];
    setRolePermissions((prev) => ({ ...prev, [role.id]: next }));
    try {
      const saved = await ApiService.setRolePermissions(role.id, next);
      setRolePermissions((prev) => ({ ...prev, [role.id]: saved }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      // Serverfehler im Klartext, u.a. die Aussperrsicherung (409) — keine
      // Vorab-Ausgrauung, die Fehlermeldung ist die einzige Anzeige davon.
      setRolePermissions((prev) => ({ ...prev, [role.id]: current }));
      await notify("Fehler", err instanceof Error ? err.message : "Berechtigung konnte nicht geaendert werden");
    }
  }

  async function handleCreate() {
    if (!newKey.trim() || !newName.trim()) return;
    setBusyRoleId("__create__");
    try {
      await ApiService.createRole({ key: newKey.trim(), displayName: newName.trim() });
      setNewKey("");
      setNewName("");
      setCreating(false);
      await loadRoles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify("Fehler", err instanceof Error ? err.message : "Rolle konnte nicht angelegt werden");
    } finally {
      setBusyRoleId(null);
    }
  }

  function startEdit(role: RoleInfo) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(role.id);
    setEditName(role.displayName);
    setEditColor(role.color);
  }

  async function saveEdit(role: RoleInfo) {
    if (!editName.trim()) return;
    setBusyRoleId(role.id);
    try {
      await ApiService.updateRole(role.id, { displayName: editName.trim(), color: editColor });
      setEditingId(null);
      await loadRoles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify("Fehler", err instanceof Error ? err.message : "Rolle konnte nicht geaendert werden");
    } finally {
      setBusyRoleId(null);
    }
  }

  async function handleDelete(role: RoleInfo) {
    const confirmed = await confirmAction({
      title: "Rolle loeschen",
      message: `Rolle "${role.displayName}" wirklich loeschen?`,
      confirmLabel: "Loeschen",
      destructive: true,
    });
    if (!confirmed) return;
    setBusyRoleId(role.id);
    try {
      await ApiService.deleteRole(role.id);
      await loadRoles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      // 409: entweder noch Nutzer zugeordnet oder die letzte Traegerin einer
      // essenziellen Berechtigung — kein automatisches Umhaengen, der Server
      // sagt im Klartext, warum es nicht geht.
      await notify("Loeschen nicht moeglich", err instanceof Error ? err.message : "Rolle konnte nicht geloescht werden");
    } finally {
      setBusyRoleId(null);
    }
  }

  if (!canManage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 40 }]}>
        <Text style={[styles.notAllowed, { color: theme.textSecondary }]}>Kein Zugriff.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Rollen</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.tint} style={{ marginTop: 30 }} />
        ) : (
          <>
            {roles.map((role) => {
              const expanded = expandedId === role.id;
              const isEditing = editingId === role.id;
              const busy = busyRoleId === role.id;
              const perms = rolePermissions[role.id] ?? [];
              const swatch = role.color ?? "#9CA3AF";

              return (
                <View key={role.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <Pressable onPress={() => toggleExpand(role.id)} style={styles.roleRow}>
                    <View style={[styles.swatch, { backgroundColor: swatch }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleName, { color: theme.text }]}>{role.displayName}</Text>
                      <Text style={[styles.roleMeta, { color: theme.textSecondary }]}>
                        {role.key} · {role.userCount} {role.userCount === 1 ? "Nutzer" : "Nutzer"}
                      </Text>
                    </View>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textTertiary} />
                  </Pressable>

                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => startEdit(role)}
                      style={[styles.smallBtn, { borderColor: theme.cardBorder }]}
                    >
                      <Ionicons name="pencil-outline" size={14} color={theme.text} />
                      <Text style={[styles.smallBtnText, { color: theme.text }]}>Bearbeiten</Text>
                    </Pressable>
                    {!role.isSystem && (
                      <Pressable
                        onPress={() => handleDelete(role)}
                        disabled={busy}
                        style={[styles.smallBtn, { borderColor: theme.danger + "55", opacity: busy ? 0.5 : 1 }]}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={theme.danger} />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={14} color={theme.danger} />
                            <Text style={[styles.smallBtnText, { color: theme.danger }]}>Loeschen</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>

                  {isEditing && (
                    <View style={[styles.editBox, { borderTopColor: theme.cardBorder }]}>
                      <TextInput
                        value={editName}
                        onChangeText={setEditName}
                        placeholder="Anzeigename"
                        placeholderTextColor={theme.textTertiary}
                        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.cardBorder, color: theme.text }]}
                      />
                      <View style={styles.colorRow}>
                        {COLOR_CHOICES.map((c) => (
                          <Pressable
                            key={c}
                            onPress={() => setEditColor(c)}
                            style={[
                              styles.colorDot,
                              { backgroundColor: c, borderColor: editColor === c ? theme.text : "transparent" },
                            ]}
                          />
                        ))}
                      </View>
                      <View style={styles.editActions}>
                        <Pressable
                          onPress={() => setEditingId(null)}
                          style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]}
                        >
                          <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Abbrechen</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => saveEdit(role)}
                          disabled={busy}
                          style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: busy ? 0.5 : 1 }]}
                        >
                          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Speichern</Text>}
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {expanded && (
                    <View style={[styles.permBox, { borderTopColor: theme.cardBorder }]}>
                      {loadingPermissions && !rolePermissions[role.id] ? (
                        <ActivityIndicator color={theme.tint} style={{ marginVertical: 12 }} />
                      ) : (
                        catalog.map((p) => {
                          const locked = p.key === "roles.manage";
                          const checked = perms.includes(p.key);
                          return (
                            <Pressable
                              key={p.key}
                              onPress={() => togglePermission(role, p.key)}
                              disabled={locked}
                              style={[styles.permRow, { opacity: locked ? 0.5 : 1 }]}
                            >
                              <Ionicons
                                name={checked ? "checkbox" : "square-outline"}
                                size={20}
                                color={locked ? theme.textTertiary : checked ? theme.tint : theme.textSecondary}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.permKey, { color: theme.text }]}>{p.key}</Text>
                                <Text style={[styles.permDesc, { color: theme.textSecondary }]}>
                                  {p.description}
                                </Text>
                                {locked && (
                                  <Text style={[styles.permLockedHint, { color: theme.textTertiary }]}>
                                    Diese Berechtigung kann nur ueber den Betreiber vergeben werden.
                                  </Text>
                                )}
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {creating ? (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Text style={[styles.cardTitle, { color: theme.tint }]}>Neue Rolle</Text>
                <TextInput
                  value={newKey}
                  onChangeText={setNewKey}
                  placeholder="Schluessel (z. B. ausbildungsleitung)"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: theme.background, borderColor: theme.cardBorder, color: theme.text }]}
                />
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Anzeigename"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.input, { backgroundColor: theme.background, borderColor: theme.cardBorder, color: theme.text }]}
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => { setCreating(false); setNewKey(""); setNewName(""); }}
                    style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]}
                  >
                    <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Abbrechen</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreate}
                    disabled={busyRoleId === "__create__" || !newKey.trim() || !newName.trim()}
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: theme.tint, opacity: !newKey.trim() || !newName.trim() ? 0.5 : 1 },
                    ]}
                  >
                    {busyRoleId === "__create__" ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Anlegen</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreating(true); }}
                style={[styles.addBtn, { borderColor: theme.tint }]}
              >
                <Ionicons name="add" size={18} color={theme.tint} />
                <Text style={[styles.addBtnText, { color: theme.tint }]}>Rolle anlegen</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notAllowed: { textAlign: "center", fontSize: 15, fontFamily: "Inter_500Medium" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 10, letterSpacing: 0.3 },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 16, height: 16, borderRadius: 5 },
  roleName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  roleMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  editBox: { borderTopWidth: 1, marginTop: 12, paddingTop: 12, gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  editActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  secondaryBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, minWidth: 90, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  permBox: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 4 },
  permRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  permKey: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  permDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  permLockedHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, fontStyle: "italic" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 14,
  },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
