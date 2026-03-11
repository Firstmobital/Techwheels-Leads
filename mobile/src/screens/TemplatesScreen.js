import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

const TABS = ["all", "vana", "matchtalk", "greenforms"];
const EMPTY_FORM = { name: "", tab: "all", day_step: 1, message: "", ppl: "" };

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [filterTab, setFilterTab] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("day_step", { ascending: true });

    if (error) {
      setStatus(error.message || "Failed to load templates.");
      return;
    }

    setTemplates(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered = useMemo(
    () => (filterTab === "all" ? templates : templates.filter((template) => template.tab === filterTab)),
    [templates, filterTab]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const saveTemplate = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      Alert.alert("Required", "Template name and message are required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      tab: form.tab,
      day_step: Number(form.day_step) || 1,
      message: form.message,
      ppl: form.ppl.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("templates").update(payload).eq("id", editingId);
      if (error) {
        setStatus(error.message || "Failed to update template.");
        return;
      }
      setStatus("Template updated.");
    } else {
      const { error } = await supabase.from("templates").insert(payload);
      if (error) {
        setStatus(error.message || "Failed to create template.");
        return;
      }
      setStatus("Template created.");
    }

    resetForm();
    await loadTemplates();
  };

  const editTemplate = (template) => {
    setEditingId(template.id);
    setForm({
      name: template.name || "",
      tab: template.tab || "all",
      day_step: Number(template.day_step) || 1,
      message: template.message || "",
      ppl: template.ppl || "",
    });
    setShowForm(true);
  };

  const deleteTemplate = async (templateId) => {
    const { error } = await supabase.from("templates").delete().eq("id", templateId);
    if (error) {
      setStatus(error.message || "Failed to delete template.");
      return;
    }
    setStatus("Template deleted.");
    await loadTemplates();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Templates</Text>
            <Text style={styles.subtitle}>{templates.length} templates</Text>
          </View>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
          >
            <Text style={styles.primaryButtonText}>Add</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.filterPill, filterTab === tab && styles.filterPillActive]}
              onPress={() => setFilterTab(tab)}
            >
              <Text style={[styles.filterPillText, filterTab === tab && styles.filterPillTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {showForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingId ? "Edit Template" : "New Template"}</Text>

            <TextInput
              style={styles.input}
              placeholder="Template name"
              value={form.name}
              onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            />

            <View style={styles.row}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {TABS.map((tab) => (
                  <Pressable
                    key={`tab-${tab}`}
                    style={[styles.filterPill, form.tab === tab && styles.filterPillActive]}
                    onPress={() => setForm((prev) => ({ ...prev, tab }))}
                  >
                    <Text style={[styles.filterPillText, form.tab === tab && styles.filterPillTextActive]}>{tab}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Day step (1-7)"
              keyboardType="number-pad"
              value={String(form.day_step)}
              onChangeText={(value) => setForm((prev) => ({ ...prev, day_step: Number(value) || 1 }))}
            />

            <TextInput
              style={styles.input}
              placeholder="PPL (optional)"
              value={form.ppl}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ppl: value }))}
            />

            <TextInput
              style={styles.messageInput}
              placeholder="Message body"
              multiline
              textAlignVertical="top"
              value={form.message}
              onChangeText={(value) => setForm((prev) => ({ ...prev, message: value }))}
            />

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={resetForm}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={saveTemplate}>
                <Text style={styles.primaryButtonText}>{editingId ? "Save" : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {filtered.length === 0 ? <Text style={styles.empty}>No templates found.</Text> : null}

        {filtered.map((template) => (
          <View key={template.id} style={styles.card}>
            <View style={styles.templateHeader}>
              <Text style={styles.cardTitle}>{template.name}</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.smallButton} onPress={() => editTemplate(template)}>
                  <Text style={styles.smallButtonText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.smallDangerButton} onPress={() => deleteTemplate(template.id)}>
                  <Text style={styles.smallDangerButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.meta}>Tab: {template.tab} | Day: {template.day_step} | PPL: {template.ppl || "-"}</Text>
            <Text style={styles.messagePreview}>{template.message}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  filterRow: {
    gap: 8,
    paddingRight: 10,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
  },
  filterPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  filterPillText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
    textTransform: "capitalize",
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: "#ffffff",
  },
  messageInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 120,
    fontSize: 13,
    backgroundColor: "#ffffff",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  smallButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  smallButtonText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "700",
  },
  smallDangerButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff1f2",
  },
  smallDangerButtonText: {
    fontSize: 11,
    color: "#dc2626",
    fontWeight: "700",
  },
  meta: {
    fontSize: 11,
    color: "#64748b",
  },
  messagePreview: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
  },
  status: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "600",
  },
  empty: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 16,
  },
});
