import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

const EMPTY_FORM = {
  name: "",
  category: "general",
  channel: "whatsapp",
  language: "en",
  template_text: "",
  is_active: true,
};

const CHANNEL_OPTIONS = ["whatsapp", "sms", "email"];
const LANGUAGE_OPTIONS = ["en", "hi"];

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
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

  const categoryOptions = useMemo(() => {
    const categories = new Set();
    templates.forEach((template) => {
      const category = String(template.category || "").trim();
      if (category) categories.add(category);
    });
    return ["all", ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
  }, [templates]);

  const languageOptions = useMemo(() => {
    const languages = new Set(["en"]);
    templates.forEach((template) => {
      const language = String(template.language || "").trim();
      if (language) languages.add(language);
    });
    return ["all", ...Array.from(languages).sort((a, b) => a.localeCompare(b))];
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((template) => {
      const category = String(template.category || "").trim();
      const language = String(template.language || "").trim();
      const matchCategory = filterCategory === "all" || category === filterCategory;
      const matchLanguage = filterLanguage === "all" || language === filterLanguage;
      return matchCategory && matchLanguage;
    });
  }, [templates, filterCategory, filterLanguage]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const saveTemplate = async () => {
    if (!form.name.trim() || !form.template_text.trim()) {
      Alert.alert("Required", "Template name and template text are required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
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
          {categoryOptions.map((category) => (
            <Pressable
              key={`category-${category}`}
              style={[styles.filterPill, filterCategory === category && styles.filterPillActive]}
              onPress={() => setFilterCategory(category)}
            >
              <Text style={[styles.filterPillText, filterCategory === category && styles.filterPillTextActive]}>
                {category === "all" ? "all categories" : category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {languageOptions.map((language) => (
            <Pressable
              key={`language-${language}`}
              style={[styles.filterPill, filterLanguage === language && styles.filterPillActive]}
              onPress={() => setFilterLanguage(language)}
            >
              <Text style={[styles.filterPillText, filterLanguage === language && styles.filterPillTextActive]}>
                {language === "all" ? "all languages" : language}
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
              placeholder="Category"
              value={form.category}
              onChangeText={(value) => setForm((prev) => ({ ...prev, category: value }))}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {CHANNEL_OPTIONS.map((channel) => (
                <Pressable
                  key={`channel-${channel}`}
                  style={[styles.filterPill, form.channel === channel && styles.filterPillActive]}
                  onPress={() => setForm((prev) => ({ ...prev, channel }))}
                >
                  <Text style={[styles.filterPillText, form.channel === channel && styles.filterPillTextActive]}>{channel}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[...new Set([...LANGUAGE_OPTIONS, ...languageOptions.filter((v) => v !== "all")])].map((language) => (
                <Pressable
                  key={`language-form-${language}`}
                  style={[styles.filterPill, form.language === language && styles.filterPillActive]}
                  onPress={() => setForm((prev) => ({ ...prev, language }))}
                >
                  <Text style={[styles.filterPillText, form.language === language && styles.filterPillTextActive]}>{language}</Text>
                </Pressable>
              ))}
            </ScrollView>

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
              Category: {template.category || "-"} | Channel: {template.channel || "-"} | Language: {template.language || "-"}
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
