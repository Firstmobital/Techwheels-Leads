import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

const EMPTY_FORM = {
  name: "",
  source: "ai",
  model_name: "",
  step: "",
  category: "general",
  channel: "whatsapp",
  language: "en",
  template_text: "",
  is_active: true,
};

const SOURCE_OPTIONS = ["ai", "vna", "match"];
const STEP_OPTIONS = ["M1", "M2", "M3", "M4"];

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [filterSource, setFilterSource] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setStatus(error.message || "Failed to load templates.");
      return;
    }

    setTemplates(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((template) => {
      const source = String(template.source || "").trim().toLowerCase();
      return filterSource === "all" || source === filterSource;
    });
  }, [templates, filterSource]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const saveTemplate = async () => {
    if (!form.name.trim() || !form.source.trim() || !form.template_text.trim()) {
      Alert.alert("Required", "Template name, source, and template text are required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      source: form.source.trim() || null,
      model_name: form.model_name.trim() || null,
      step: form.step.trim() || null,
      category: form.category.trim() || "general",
      channel: form.channel.trim() || "whatsapp",
      language: form.language.trim() || "en",
      template_text: form.template_text,
      is_active: Boolean(form.is_active),
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
      source: String(template.source || "").trim(),
      model_name: template.model_name || "",
      step: template.step || "",
      category: template.category || "general",
      channel: template.channel || "whatsapp",
      language: template.language || "en",
      template_text: template.template_text || "",
      is_active: template.is_active !== false,
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
          {["all", ...SOURCE_OPTIONS].map((source) => (
            <Pressable
              key={`source-filter-${source}`}
              style={[styles.filterPill, filterSource === source && styles.filterPillActive]}
              onPress={() => setFilterSource(source)}
            >
              <Text style={[styles.filterPillText, filterSource === source && styles.filterPillTextActive]}>
                {source === "all" ? "All" : source.toUpperCase()}
              </Text>
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

            <TextInput
              style={styles.input}
              placeholder="Source"
              value={form.source}
              editable={false}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {SOURCE_OPTIONS.map((source) => (
                <Pressable
                  key={`source-${source}`}
                  style={[styles.filterPill, form.source === source && styles.filterPillActive]}
                  onPress={() => setForm((prev) => ({ ...prev, source }))}
                >
                  <Text style={[styles.filterPillText, form.source === source && styles.filterPillTextActive]}>{source}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {SOURCE_OPTIONS.includes(form.source) ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={form.source === "ai" ? "Model name" : "Model name (optional)"}
                  value={form.model_name}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, model_name: value }))}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Pressable
                    style={[styles.filterPill, form.step === "" && styles.filterPillActive]}
                    onPress={() => setForm((prev) => ({ ...prev, step: "" }))}
                  >
                    <Text style={[styles.filterPillText, form.step === "" && styles.filterPillTextActive]}>
                      {form.source === "ai" ? "Select step" : "No step (optional)"}
                    </Text>
                  </Pressable>
                  {STEP_OPTIONS.map((step) => (
                    <Pressable
                      key={`step-${step}`}
                      style={[styles.filterPill, form.step === step && styles.filterPillActive]}
                      onPress={() => setForm((prev) => ({ ...prev, step }))}
                    >
                      <Text style={[styles.filterPillText, form.step === step && styles.filterPillTextActive]}>{step}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Pressable
              style={[styles.filterPill, form.is_active && styles.filterPillActive]}
              onPress={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
            >
              <Text style={[styles.filterPillText, form.is_active && styles.filterPillTextActive]}>
                {form.is_active ? "active" : "inactive"}
              </Text>
            </Pressable>

            <TextInput
              style={styles.messageInput}
              placeholder="Template text"
              multiline
              textAlignVertical="top"
              value={form.template_text}
              onChangeText={(value) => setForm((prev) => ({ ...prev, template_text: value }))}
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

            <Text style={styles.meta}>
              Source: {template.source ? String(template.source).toUpperCase() : "-"} | Model: {template.model_name || "-"} | Step: {template.step || "-"}
            </Text>
            <Text style={styles.meta}>Status: {template.is_active === false ? "inactive" : "active"}</Text>
            <Text style={styles.messagePreview}>{template.template_text || ""}</Text>
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
