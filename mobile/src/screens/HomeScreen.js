import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

const FOLLOW_UP_DAYS = [1, 2, 5];
const MATCHTALK_FOLLOW_UP_DAYS = [1, 2, 4];

const CATEGORY_ALIASES = {
  vana: ["vana", "vna"],
  matchtalk: ["matchtalk", "match_stock", "match"],
  greenforms: ["greenforms", "green_forms", "greenform"],
  ai_leads: ["ai_leads", "ai-leads", "ai"],
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toCanonicalCategory = (value) => {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return "";
  if (token === "all" || token === "general") return token;
  const match = Object.entries(CATEGORY_ALIASES).find(([, aliases]) => aliases.includes(token));
  return match ? match[0] : token;
};

const getTemplateCategory = (template) => {
  return toCanonicalCategory(template?.category || template?.source || "");
};

const VALID_LEAD_SOURCES = new Set(["walkin", "ivr", "ai"]);
const TAB_TO_DEFAULT_SOURCE = {
  vana: "walkin",
  matchtalk: "walkin",
  greenforms: "walkin",
  ai_leads: "ai",
};

const normalizeLeadSource = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_LEAD_SOURCES.has(normalized) ? normalized : null;
};

const parseCompositeLeadId = (id) => {
  const raw = String(id || "").trim();
  const splitIndex = raw.indexOf(":");
  if (splitIndex <= 0 || splitIndex >= raw.length - 1) {
    return { source: null, recordId: raw || null };
  }
  return {
    source: normalizeLeadSource(raw.slice(0, splitIndex)),
    recordId: raw.slice(splitIndex + 1),
  };
};

const getLeadSourceForType = (lead, tabId) => {
  const fromLead = normalizeLeadSource(lead?.source_type || lead?.lead_source || lead?.source_pv);
  if (fromLead) return fromLead;
  return normalizeLeadSource(TAB_TO_DEFAULT_SOURCE[tabId]) || "walkin";
};

const getSourceRecordIdForLead = (lead) => {
  const explicit = lead?.source_record_id;
  if (explicit !== null && explicit !== undefined && String(explicit).trim()) {
    return String(explicit).trim();
  }

  const parsed = parseCompositeLeadId(lead?.id);
  if (parsed.recordId) return parsed.recordId;

  return lead?.id !== null && lead?.id !== undefined ? String(lead.id) : null;
};

const buildSentMessageKey = (leadSource, sourceRecordId) => {
  const source = normalizeLeadSource(leadSource);
  const record = String(sourceRecordId || "").trim();
  if (!source || !record) return null;
  return `${source}:${record}`;
};

const getSentMessageKeyForLead = (lead, tabId) => {
  const leadSource = getLeadSourceForType(lead, tabId);
  const sourceRecordId = getSourceRecordIdForLead(lead);
  return buildSentMessageKey(leadSource, sourceRecordId);
};

const getSentMessageKeyForRow = (row) => {
  return buildSentMessageKey(row?.lead_source, row?.source_record_id);
};

const TABS = [
  {
    id: "vana",
    label: "VNA",
    table: "vna_stock",
    orderBy: "created_at",
    caField: "employee_full_name",
    titleField: "customer_name",
    subtitleField: "chassis_no",
  },
  {
    id: "matchtalk",
    label: "Match",
    table: "matched_stock_customers",
    orderBy: "created_at",
    caField: "employee_full_name",
    titleField: "customer_name",
    subtitleField: "model_name",
  },
  {
    id: "greenforms",
    label: "Green",
    table: "greenform_submitted_leads",
    orderBy: "created_at",
    caField: "ca_name", // View provides ca_name
    titleField: "customer_name",
    subtitleField: "model_name",
  },
  {
    id: "ai_leads",
    label: "AI",
    table: "ai_leads",
    orderBy: "created_at",
    caField: "salesperson_id",
    titleField: "customer_name",
    subtitleField: "remarks",
  },
];

export default function HomeScreen() {
  const { user, signOut, isLoadingAuth } = useAuth();
  const [activeTab, setActiveTab] = useState("vana");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [preview, setPreview] = useState(null);
  const [sendingLeadId, setSendingLeadId] = useState(null);

  const defaultFilters = {
    searchQuery: "",
    selectedModel: "all",
    leadView: "pending",
    allLeadsMode: "all",
    selectedPerson: "all",
    selectedSource: "all",
    selectedBranch: "all",
    allocationOnly: false,
  };

  const [filtersByTab, setFiltersByTab] = useState(() =>
    TABS.reduce((acc, tab) => {
      acc[tab.id] = { ...defaultFilters };
      return acc;
    }, {})
  );

  const isAdmin = user?.role === "admin";
  const userFullName = user?.fullName || "";
  const employeeId = user?.employeeId || null;

  const tabConfig = useMemo(
    () => TABS.find((tab) => tab.id === activeTab) ?? TABS[0],
    [activeTab]
  );

  const activeFilters = filtersByTab[activeTab] || defaultFilters;
  const updateActiveFilters = (partial) => {
    setFiltersByTab((prev) => ({
      ...prev,
      [activeTab]: {
        ...(prev[activeTab] || defaultFilters),
        ...partial,
      },
    }));
  };
  const resetActiveFilters = () => {
    setFiltersByTab((prev) => ({
      ...prev,
      [activeTab]: { ...defaultFilters },
    }));
  };
  const hasActiveFilters =
    activeFilters.searchQuery.trim().length > 0 ||
    activeFilters.selectedModel !== "all" ||
    activeFilters.selectedPerson !== "all" ||
    activeFilters.selectedSource !== "all" ||
    activeFilters.selectedBranch !== "all" ||
    activeFilters.allocationOnly ||
    activeFilters.allLeadsMode !== "all";

  const sentMessageKeys = useMemo(() => {
    const keys = new Set();
    sentMessages.forEach((row) => {
      const key = getSentMessageKeyForRow(row);
      if (key) keys.add(key);
    });
    return keys;
  }, [sentMessages]);

  const modelField = "model_name";
  const personField = tabConfig.caField;
  const modelOptions = useMemo(() => {
    const options = new Set();
    leads.forEach((lead) => {
      const value = String(lead?.[modelField] || lead?.ppl || lead?.car_model || "").trim();
      if (value) options.add(value);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [leads, modelField]);

  const personOptions = useMemo(() => {
    const options = new Set();
    leads.forEach((lead) => {
      const value = String(lead?.[personField] || "").trim();
      if (value) options.add(value);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [leads, personField]);

  const sourceOptions = useMemo(() => {
    if (activeTab !== "greenforms") return [];
    const options = new Set();
    leads.forEach((lead) => {
      const value = String(lead?.source_pv || "").trim();
      if (value) options.add(value);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [leads, activeTab]);

  const branchOptions = useMemo(() => {
    if (activeTab === "greenforms") return [];
    const options = new Set();
    leads.forEach((lead) => {
      const value = String(lead?.branch || "").trim();
      if (value) options.add(value);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [leads, activeTab]);

  const sentTodayLeadKeys = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const keys = new Set();
    sentMessages.forEach((row) => {
      const key = getSentMessageKeyForRow(row);
      if (!key) return;
      const sentAt = new Date(row?.created_at || row?.sent_at || row?.updated_at || 0);
      if (Number.isNaN(sentAt.getTime())) return;
      if (sentAt >= start && sentAt < end) {
        keys.add(key);
      }
    });
    return keys;
  }, [sentMessages]);

  const filteredBaseLeads = useMemo(() => {
    return leads.filter((lead) => {
      const query = activeFilters.searchQuery.trim().toLowerCase();
      const customer = String(lead?.customer_name || "").toLowerCase();
      const phone = String(lead?.mobile_number || lead?.phone_number || "");
      const modelValue = String(lead?.[modelField] || lead?.ppl || lead?.car_model || "");

      const matchesSearch =
        !query || customer.includes(query) || phone.includes(query) || modelValue.toLowerCase().includes(query);
      const matchesModel = activeFilters.selectedModel === "all" || modelValue === activeFilters.selectedModel;
      const personValue = String(lead?.[personField] || "").trim();
      const sourceValue = String(lead?.source_pv || "").trim();
      const branchValue = String(lead?.branch || "").trim();
      const matchesPerson = activeFilters.selectedPerson === "all" || personValue === activeFilters.selectedPerson;
      const matchesSource = activeFilters.selectedSource === "all" || sourceValue === activeFilters.selectedSource;
      const matchesBranch = activeFilters.selectedBranch === "all" || branchValue === activeFilters.selectedBranch;
      const allocationStatus = String(lead?.allocation_status || lead?.status || "");
      const matchesAllocation = !activeFilters.allocationOnly || allocationStatus.toLowerCase() === "next in allocation";

      return (
        matchesSearch &&
        matchesModel &&
        matchesPerson &&
        matchesSource &&
        matchesBranch &&
        matchesAllocation
      );
    });
  }, [
    leads,
    activeFilters,
    modelField,
    sentMessageKeys,
    personField,
    activeTab,
  ]);

  const statsSummary = useMemo(() => {
    if (activeTab === "ai_leads") return null;
    let dueToday = 0;
    let overdue = 0;
    let sent = 0;
    filteredBaseLeads.forEach((lead) => {
      const leadKey = getSentMessageKeyForLead(lead, activeTab);
      const history = sentMessages.filter((m) => {
        const msgKey = getSentMessageKeyForRow(m);
        return Boolean(leadKey && msgKey && msgKey === leadKey);
      });
      const relevant = templates.filter((t) => {
        const category = toCanonicalCategory(t?.category || t?.source || "");
        return (category === activeTab || category === "all" || category === "general") && t?.is_active !== false;
      });
      const nextStep = getNextDueStep(history, activeTab, relevant);
      if (!nextStep) { sent++; return; }
      if (nextStep.overdue) { overdue++; return; }
      if (nextStep.daysUntil === 0) { dueToday++; }
    });
    return { dueToday, overdue, sent };
  }, [filteredBaseLeads, sentMessages, templates, activeTab]);

  const getMessageForStep = (tabId, lead, step) => {
    const customerName = lead?.customer_name || "Customer";
    const ppl = lead?.ppl || "";
    const pl = lead?.pl || "";
    const caName = lead?.ca_name || "";
    const carModel = lead?.car_model || ppl || "car";

    if (tabId === "matchtalk") {
      if (step === 1) {
        return `Booking Name: ${customerName}\nCar Model: ${ppl}\nVariant: ${pl}\nSales Advisor: ${caName}\n\nYour vehicle is now available for billing and chassis allotment. Please complete billing and RTO formalities at the earliest.`;
      }
      if (step === 2) {
        return `Hello ${customerName},\n\nThis is a follow-up reminder for your billing and RTO process. Please complete it soon to avoid reallocation.`;
      }
      return `Hello ${customerName},\n\nFinal reminder: please complete billing formalities immediately to avoid reallocation of your vehicle.`;
    }

    if (step === 1) {
      return `Hello ${customerName},\n\nThank you for your interest in the ${carModel}. Our team is ready to help you with details or next steps.`;
    }
    if (step === 2) {
      return `Hello ${customerName},\n\nJust following up on your interest in the ${carModel}. Please let us know if you would like to proceed.`;
    }
    return `Hello ${customerName},\n\nFinal follow-up regarding the ${carModel}. We would be happy to assist whenever you are ready.`;
  };

  const getDaysSinceFirstSent = (history) => {
    if (!history?.length) return null;
    const first = [...history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    if (!first?.created_at) return null;

    const oneDayMs = 1000 * 60 * 60 * 24;
    return Math.floor((Date.now() - new Date(first.created_at).getTime()) / oneDayMs);
  };

  const getNextDueStep = (history, tabId, templateOptions = []) => {
    const normalizedSequenceTemplates = (Array.isArray(templateOptions) ? templateOptions : [])
      .filter((template) => template?.step_number !== null && template?.step_number !== undefined)
      .map((template, index) => ({
        ...template,
        step_number: Math.max(1, toInt(template?.step_number, index + 1)),
        delay_days: Math.max(0, toInt(template?.delay_days, 0)),
      }))
      .sort((a, b) => {
        if (a.step_number !== b.step_number) return a.step_number - b.step_number;
        return a.delay_days - b.delay_days;
      });

    const hasConfiguredTiming = normalizedSequenceTemplates.some(
      (template) => template.step_number > 1 || template.delay_days > 0
    );
    const sequenceTemplates = hasConfiguredTiming ? normalizedSequenceTemplates : [];

    const sentCount = history?.length || 0;

    if (sequenceTemplates.length > 0) {
      if (sentCount >= sequenceTemplates.length) return null;

      const nextTemplate = sequenceTemplates[sentCount];
      const nextStep = Math.max(1, toInt(nextTemplate?.step_number, sentCount + 1));
      const nextDelay = Math.max(0, toInt(nextTemplate?.delay_days, 0));

      const daysSinceFirst = getDaysSinceFirstSent(history);
      if (daysSinceFirst === null) {
        return { step: nextStep, overdue: false, daysUntil: nextDelay };
      }

      if (daysSinceFirst >= nextDelay) {
        return { step: nextStep, overdue: daysSinceFirst > nextDelay, daysUntil: 0 };
      }

      return { step: nextStep, overdue: false, daysUntil: Math.max(nextDelay - daysSinceFirst, 0) };
    }

    const daysSequence = tabId === "matchtalk" ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS;

    if (sentCount >= daysSequence.length) return null;

    const nextStep = daysSequence[sentCount];
    if (nextStep === 1) {
      return { step: 1, overdue: false, daysUntil: 0 };
    }

    const daysSinceFirst = getDaysSinceFirstSent(history);
    if (daysSinceFirst === null) {
      return { step: nextStep, overdue: false, daysUntil: nextStep };
    }

    if (daysSinceFirst >= nextStep) {
      return { step: nextStep, overdue: true, daysUntil: 0 };
    }

    return { step: nextStep, overdue: false, daysUntil: Math.max(nextStep - daysSinceFirst, 0) };
  };

  const normalizePhone = (value) => String(value || "").replace(/[^0-9]/g, "");

  const fillTemplatePlaceholders = (rawMessage, lead) => {
    const safe = String(rawMessage || "");
    return safe
      .replace(/{customer_name}/g, lead?.customer_name || "")
      .replace(/{name}/g, lead?.customer_name || "")
      .replace(/{ppl}/g, lead?.ppl || "")
      .replace(/{pl}/g, lead?.pl || "")
      .replace(/{ca_name}/g, lead?.ca_name || "")
      .replace(/{car}/g, lead?.ppl || lead?.car_model || "car");
  };

  const getTemplateOptionsForLeadStep = (lead) => {
    const leadLanguage = String(lead?.language || lead?.preferred_language || "en").trim().toLowerCase();
    const relevant = templates.filter((template) => {
      const category = getTemplateCategory(template);
      const categoryMatch = category === activeTab || category === "all" || category === "general";
      const active = template?.is_active !== false;
      return categoryMatch && active;
    });

    const languageSpecific = relevant.filter(
      (template) => String(template?.language || "").trim().toLowerCase() === leadLanguage
    );
    if (languageSpecific.length > 0) {
      return [...languageSpecific].sort((a, b) => Math.max(1, toInt(a?.step_number, 1)) - Math.max(1, toInt(b?.step_number, 1)));
    }

    const defaults = relevant.filter((template) => {
      const language = String(template?.language || "").trim().toLowerCase();
      return !language || language === "en";
    });

    const rows = defaults.length > 0 ? defaults : relevant;
    return [...rows].sort((a, b) => Math.max(1, toInt(a?.step_number, 1)) - Math.max(1, toInt(b?.step_number, 1)));
  };

  const pendingLeads = useMemo(() => {
    return filteredBaseLeads.filter((lead) => {
      const leadKey = getSentMessageKeyForLead(lead, activeTab);
      const history = sentMessages.filter((m) => {
        const msgKey = getSentMessageKeyForRow(m);
        return Boolean(leadKey && msgKey && msgKey === leadKey);
      });
      const templateOptions = getTemplateOptionsForLeadStep(lead);
      const nextStep = getNextDueStep(history, activeTab, templateOptions);
      return Boolean(nextStep && (nextStep.daysUntil === 0 || nextStep.overdue));
    });
  }, [filteredBaseLeads, sentMessages, activeTab, templates]);

  const allLeads = useMemo(() => {
    if (activeFilters.allLeadsMode === "sent_today") {
      return filteredBaseLeads.filter((lead) => {
        const leadKey = getSentMessageKeyForLead(lead, activeTab);
        return Boolean(leadKey && sentTodayLeadKeys.has(leadKey));
      });
    }
    return filteredBaseLeads;
  }, [filteredBaseLeads, activeFilters.allLeadsMode, activeTab, sentTodayLeadKeys]);

  const displayedLeads = activeFilters.leadView === "pending" ? pendingLeads : allLeads;

  const getPreviewMessage = (previewState) => {
    if (!previewState) return "";
    if (previewState.selectedTemplateId === "default") {
      return previewState.defaultMessage;
    }

    const selectedTemplate = previewState.templateOptions.find(
      (template) => String(template.id) === String(previewState.selectedTemplateId)
    );

    if (!selectedTemplate?.template_text) {
      return previewState.defaultMessage;
    }

    return fillTemplatePlaceholders(selectedTemplate.template_text, previewState.lead);
  };

  const openMessagePreview = (lead, nextStep) => {
    const defaultMessage = getMessageForStep(activeTab, lead, nextStep.step);
    const templateOptions = getTemplateOptionsForLeadStep(lead);

    setPreview({
      lead,
      step: nextStep.step,
      defaultMessage,
      templateOptions,
      selectedTemplateId: "default",
      phone: normalizePhone(lead?.mobile_number || lead?.phone_number),
    });
  };

  const handleSendWhatsApp = async () => {
    if (!preview?.lead?.id) return;
    if (!preview.phone) {
      Alert.alert("Missing phone", "This lead does not have a valid phone number.");
      return;
    }

    setSendingLeadId(preview.lead.id);

    try {
      const resolvedMessage = getPreviewMessage(preview);
      const waUrl = `https://wa.me/${preview.phone}?text=${encodeURIComponent(resolvedMessage)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (!canOpen) {
        throw new Error("Unable to open WhatsApp URL on this device.");
      }

      await Linking.openURL(waUrl);

      const selectedTemplate = preview.selectedTemplateId === "default"
        ? null
        : preview.templateOptions.find(
            (template) => String(template.id) === String(preview.selectedTemplateId)
          ) || null;

      const leadSource = getLeadSourceForType(preview.lead, activeTab);
      const sourceRecordId = getSourceRecordIdForLead(preview.lead);

      const payload = {
        customer_name: preview.lead.customer_name || null,
        mobile_number: preview.lead.mobile_number || preview.lead.phone_number || "",
        message_text: resolvedMessage,
        template_id: selectedTemplate?.id ?? null,
        lead_source: leadSource,
        source_record_id: sourceRecordId,
        sent_by_employee_id: employeeId ?? null,
        sent_via: "whatsapp_link",
        status: "sent",
      };

      const { data, error: insertError } = await supabase
        .from("sent_messages")
        .insert(payload)
        .select("*")
        .maybeSingle();

      if (insertError) throw insertError;

      setSentMessages((prev) => [data || payload, ...prev]);
      setPreview(null);
    } catch (sendError) {
      Alert.alert("Send failed", sendError?.message || "Unable to send message right now.");
    } finally {
      setSendingLeadId(null);
    }
  };

  const loadLeads = async ({ isRefresh = false } = {}) => {
    if (!tabConfig) return;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError("");

    let query = supabase
      .from(tabConfig.table)
      .select("*")
      .order(tabConfig.orderBy, { ascending: false })
      .limit(100);

    // Scoping for non-admins
    if (!isAdmin) {
      if (tabConfig.id === "ai_leads") {
        query = query.or(`salesperson_id.is.null,salesperson_id.eq.${employeeId}`);
      } else if (tabConfig.id === "greenforms") {
        query = query.or(`salesperson_id.eq.${employeeId},ca_name.eq.${userFullName}`);
      } else {
        // VNA and Match use employee_full_name
        query = query.eq("employee_full_name", userFullName);
      }
    }

    const [leadsResult, sentResult, templatesResult] = await Promise.all([
      query,
      supabase
        .from("sent_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("templates")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);

    if (leadsResult.error) {
      setError(leadsResult.error.message || "Failed to load leads.");
      setLeads([]);
      setSentMessages([]);
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
      return;
    }

    setLeads(Array.isArray(leadsResult.data) ? leadsResult.data : []);
    setSentMessages(Array.isArray(sentResult.data) ? sentResult.data : []);
    setTemplates(Array.isArray(templatesResult.data) ? templatesResult.data : []);

    if (isRefresh) {
      setIsRefreshing(false);
    } else {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [activeTab, user?.id]);



  if (isLoadingAuth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.subtitle}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>LeadConnect</Text>
            <Text style={styles.subtitle}>Signed in as {user?.fullName || user?.email || "Unknown user"}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.signOutButton} onPress={signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{tabConfig.label} Leads</Text>
          <View style={styles.sectionActions}>
            {hasActiveFilters ? (
              <Pressable style={styles.resetButton} onPress={resetActiveFilters}>
                <Text style={styles.resetButtonText}>Reset Filters</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.refreshButton} onPress={() => loadLeads({ isRefresh: true })}>
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.filtersWrap}>
          <TextInput
            value={activeFilters.searchQuery}
            onChangeText={(value) => updateActiveFilters({ searchQuery: value })}
            placeholder="Search name, phone, model"
            style={styles.searchInput}
            autoCapitalize="none"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              style={[styles.filterPill, activeFilters.selectedModel === "all" && styles.filterPillActive]}
              onPress={() => updateActiveFilters({ selectedModel: "all" })}
            >
              <Text style={[styles.filterPillText, activeFilters.selectedModel === "all" && styles.filterPillTextActive]}>
                All Models
              </Text>
            </Pressable>

            {modelOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.filterPill, activeFilters.selectedModel === option && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ selectedModel: option })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.selectedModel === option && styles.filterPillTextActive,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {(activeTab === "vana" || activeTab === "matchtalk" || activeTab === "greenforms") && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, activeFilters.selectedPerson === "all" && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ selectedPerson: "all" })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.selectedPerson === "all" && styles.filterPillTextActive,
                  ]}
                >
                  {activeTab === "greenforms" ? "All Employee" : "All CA"}
                </Text>
              </Pressable>

              {(isAdmin ? personOptions : []).map((option) => (
                <Pressable
                  key={option}
                  style={[styles.filterPill, activeFilters.selectedPerson === option && styles.filterPillActive]}
                  onPress={() => updateActiveFilters({ selectedPerson: option })}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      activeFilters.selectedPerson === option && styles.filterPillTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {activeTab === "greenforms" && sourceOptions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, activeFilters.selectedSource === "all" && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ selectedSource: "all" })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.selectedSource === "all" && styles.filterPillTextActive,
                  ]}
                >
                  All Sources
                </Text>
              </Pressable>

              {sourceOptions.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.filterPill, activeFilters.selectedSource === option && styles.filterPillActive]}
                  onPress={() => updateActiveFilters({ selectedSource: option })}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      activeFilters.selectedSource === option && styles.filterPillTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {activeTab !== "greenforms" && branchOptions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, activeFilters.selectedBranch === "all" && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ selectedBranch: "all" })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.selectedBranch === "all" && styles.filterPillTextActive,
                  ]}
                >
                  All Branches
                </Text>
              </Pressable>

              {branchOptions.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.filterPill, activeFilters.selectedBranch === option && styles.filterPillActive]}
                  onPress={() => updateActiveFilters({ selectedBranch: option })}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      activeFilters.selectedBranch === option && styles.filterPillTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {activeTab === "vana" ? (
            <Pressable
              style={[styles.sentToggle, activeFilters.allocationOnly && styles.sentToggleActive]}
              onPress={() => updateActiveFilters({ allocationOnly: !activeFilters.allocationOnly })}
            >
              <Text style={[styles.sentToggleText, activeFilters.allocationOnly && styles.sentToggleTextActive]}>
                {activeFilters.allocationOnly ? "Next In Allocation Only" : "Filter: Next In Allocation"}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.leadViewRow}>
            <Pressable
              style={[
                styles.leadViewButton,
                activeFilters.leadView === "pending" && styles.leadViewButtonActive,
              ]}
              onPress={() => updateActiveFilters({ leadView: "pending" })}
            >
              <Text
                style={[
                  styles.leadViewText,
                  activeFilters.leadView === "pending" && styles.leadViewTextActive,
                ]}
              >
                Pending Today ({pendingLeads.length})
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.leadViewButton,
                activeFilters.leadView === "all" && styles.leadViewButtonActive,
              ]}
              onPress={() => updateActiveFilters({ leadView: "all" })}
            >
              <Text
                style={[
                  styles.leadViewText,
                  activeFilters.leadView === "all" && styles.leadViewTextActive,
                ]}
              >
                All Leads ({allLeads.length})
              </Text>
            </Pressable>
          </View>

          {activeFilters.leadView === "all" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, activeFilters.allLeadsMode === "all" && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ allLeadsMode: "all" })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.allLeadsMode === "all" && styles.filterPillTextActive,
                  ]}
                >
                  All Leads
                </Text>
              </Pressable>
              <Pressable
                style={[styles.filterPill, activeFilters.allLeadsMode === "sent_today" && styles.filterPillActive]}
                onPress={() => updateActiveFilters({ allLeadsMode: "sent_today" })}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    activeFilters.allLeadsMode === "sent_today" && styles.filterPillTextActive,
                  ]}
                >
                  Sent Today
                </Text>
              </Pressable>
            </ScrollView>
          ) : null}

          <Text style={styles.countText}>
            {displayedLeads.length} leads
            {sentMessageKeys.size > 0 ? ` • ${sentMessageKeys.size} sent` : ""}
          </Text>
        </View>

        {statsSummary && !isLoading && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, statsSummary.dueToday > 0 && styles.statCardDueToday]}>
              <Text style={[styles.statNumber, statsSummary.dueToday > 0 && styles.statNumberDueToday]}>
                {statsSummary.dueToday}
              </Text>
              <Text style={styles.statLabel}>Due Today</Text>
            </View>
            <View style={[styles.statCard, statsSummary.overdue > 0 && styles.statCardOverdue]}>
              <Text style={[styles.statNumber, statsSummary.overdue > 0 && styles.statNumberOverdue]}>
                {statsSummary.overdue}
              </Text>
              <Text style={styles.statLabel}>Overdue</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{statsSummary.sent}</Text>
              <Text style={styles.statLabel}>Sent</Text>
            </View>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#1d4ed8" />
          </View>
        ) : (
          <FlatList
            data={displayedLeads}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadLeads({ isRefresh: true })}
                tintColor="#1d4ed8"
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {activeFilters.leadView === "pending"
                  ? "No pending leads for today."
                  : "No leads found for current filters."}
              </Text>
            }
            renderItem={({ item }) => {
              const title = item?.[tabConfig.titleField] || "Unnamed lead";
              const subtitle = item?.[tabConfig.subtitleField] || "No details";
              const assignedTo =
                tabConfig.caField && item?.[tabConfig.caField]
                  ? item[tabConfig.caField]
                  : item?.assigned_to || "Unassigned";
              const leadKey = getSentMessageKeyForLead(item, activeTab);
              const history = sentMessages.filter((m) => {
                const msgKey = getSentMessageKeyForRow(m);
                return Boolean(leadKey && msgKey && msgKey === leadKey);
              });
              const templateOptions = getTemplateOptionsForLeadStep(item);
              const nextStep = getNextDueStep(history, activeTab, templateOptions);
              const isDone = !nextStep;
              const isOverdue = Boolean(nextStep?.overdue);

              const hasConfiguredTiming = templateOptions
                .filter((template) => template?.step_number !== null && template?.step_number !== undefined)
                .some((template, index) => {
                  const stepNumber = Math.max(1, toInt(template?.step_number, index + 1));
                  const delayDays = Math.max(0, toInt(template?.delay_days, 0));
                  return stepNumber > 1 || delayDays > 0;
                });

              const followupDays = hasConfiguredTiming
                ? templateOptions
                    .filter((template) => template?.step_number !== null && template?.step_number !== undefined)
                    .map((template, index) => Math.max(1, toInt(template?.step_number, index + 1)))
                    .sort((a, b) => a - b)
                : (activeTab === "matchtalk" ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS);
              const dueLabel = hasConfiguredTiming ? "Step" : "Day";
              const sentSteps = new Set(followupDays.slice(0, history.length));

              return (
                <View style={styles.leadCard}>
                  <Text style={styles.leadTitle}>{title}</Text>
                  <Text style={styles.leadSubtitle}>{subtitle}</Text>
                  <Text style={styles.leadMeta}>Assigned: {assignedTo}</Text>

                  <View style={styles.stepRow}>
                    {followupDays.map((day) => {
                      const sent = sentSteps.has(day);
                      return (
                        <View
                          key={`${item.id}-${day}`}
                          style={[
                            styles.stepPill,
                            sent && styles.stepPillSent,
                            !sent && nextStep?.step === day && isOverdue && styles.stepPillDue,
                          ]}
                        >
                          <Text
                            style={[
                              styles.stepPillText,
                              sent && styles.stepPillTextSent,
                              !sent && nextStep?.step === day && isOverdue && styles.stepPillTextDue,
                            ]}
                          >
                            {dueLabel} {day}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.actionRow}>
                    {isDone ? (
                      <Text style={styles.doneText}>Sequence complete</Text>
                    ) : (
                      <Pressable
                        style={[styles.sendButton, isOverdue && styles.sendButtonDue]}
                        onPress={() => openMessagePreview(item, nextStep)}
                        disabled={sendingLeadId === item.id}
                      >
                        <Text style={styles.sendButtonText}>
                          {sendingLeadId === item.id
                            ? "Sending..."
                            : `WhatsApp ${dueLabel} ${nextStep.step}`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        <Modal transparent visible={Boolean(preview)} animationType="slide" onRequestClose={() => setPreview(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Message Preview</Text>
              <Text style={styles.modalSubtitle}>
                {preview ? `Day ${preview.step} · ${preview.lead?.customer_name || "Lead"}` : ""}
              </Text>

              {preview && preview.templateOptions.length > 0 ? (
                <View style={styles.templateWrap}>
                  <Text style={styles.templateLabel}>Template</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateOptionsRow}>
                    <Pressable
                      style={[
                        styles.templatePill,
                        preview.selectedTemplateId === "default" && styles.templatePillActive,
                      ]}
                      onPress={() =>
                        setPreview((prev) => ({
                          ...prev,
                          selectedTemplateId: "default",
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.templatePillText,
                          preview.selectedTemplateId === "default" && styles.templatePillTextActive,
                        ]}
                      >
                        Default
                      </Text>
                    </Pressable>

                    {preview.templateOptions.map((template) => {
                      const isSelected = String(preview.selectedTemplateId) === String(template.id);
                      return (
                        <Pressable
                          key={String(template.id)}
                          style={[styles.templatePill, isSelected && styles.templatePillActive]}
                          onPress={() =>
                            setPreview((prev) => ({
                              ...prev,
                              selectedTemplateId: String(template.id),
                            }))
                          }
                        >
                          <Text style={[styles.templatePillText, isSelected && styles.templatePillTextActive]}>
                            {template.name || "Template"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <ScrollView style={styles.messageBox}>
                <Text style={styles.messageText}>{getPreviewMessage(preview)}</Text>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setPreview(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalSend} onPress={handleSendWhatsApp}>
                  <Text style={styles.modalSendText}>Open WhatsApp</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 13,
    color: "#334155",
    marginTop: 2,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  signOutButton: {
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "600",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    paddingVertical: 9,
  },
  tabButtonActive: {
    backgroundColor: "#0f172a",
  },
  tabText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resetButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
  },
  resetButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  refreshButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  filtersWrap: {
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0f172a",
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
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  sentToggle: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
  },
  sentToggleActive: {
    borderColor: "#1d4ed8",
    backgroundColor: "#dbeafe",
  },
  sentToggleText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  sentToggleTextActive: {
    color: "#1d4ed8",
  },
  countText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  leadViewRow: {
    flexDirection: "row",
    gap: 8,
  },
  leadViewButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#e2e8f0",
  },
  leadViewButtonActive: {
    backgroundColor: "#0f172a",
  },
  leadViewText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  leadViewTextActive: {
    color: "#ffffff",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 10,
    alignItems: "center",
  },
  statCardDueToday: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  statCardOverdue: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  statNumberDueToday: {
    color: "#16a34a",
  },
  statNumberOverdue: {
    color: "#dc2626",
  },
  statLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  errorText: {
    color: "#dc2626",
    marginBottom: 8,
    fontSize: 13,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 36,
    color: "#64748b",
  },
  leadCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 4,
  },
  leadTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  leadSubtitle: {
    fontSize: 13,
    color: "#334155",
  },
  leadMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
  stepRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  stepPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#f8fafc",
  },
  stepPillSent: {
    borderColor: "#059669",
    backgroundColor: "#ecfdf5",
  },
  stepPillDue: {
    borderColor: "#ea580c",
    backgroundColor: "#fff7ed",
  },
  stepPillText: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
  },
  stepPillTextSent: {
    color: "#047857",
  },
  stepPillTextDue: {
    color: "#c2410c",
  },
  actionRow: {
    marginTop: 10,
    alignItems: "flex-start",
  },
  sendButton: {
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButtonDue: {
    backgroundColor: "#ea580c",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  doneText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    minHeight: 340,
    maxHeight: "85%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
  templateWrap: {
    marginTop: 10,
  },
  templateLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 6,
    fontWeight: "600",
  },
  templateOptionsRow: {
    gap: 8,
    paddingRight: 10,
  },
  templatePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f8fafc",
  },
  templatePillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  templatePillText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  templatePillTextActive: {
    color: "#ffffff",
  },
  messageBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 10,
  },
  messageText: {
    color: "#1e293b",
    fontSize: 13,
    lineHeight: 20,
  },
  attachmentsWrap: {
    marginTop: 10,
  },
  attachmentsLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 6,
  },
  attachmentItem: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  attachmentText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    marginRight: 8,
  },
  attachmentHint: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "700",
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#334155",
    fontWeight: "700",
  },
  modalSend: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    paddingVertical: 11,
    alignItems: "center",
  },
  modalSendText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
