import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function InviteUsersScreen() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [caInput, setCaInput] = useState("");
  const [caNames, setCaNames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, ca_names")
      .order("email", { ascending: true });

    if (error) {
      setStatus(error.message || "Failed to load users.");
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    setUsers(rows);
    return rows;
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const salesUsers = useMemo(() => users.filter((user) => user.role === "user"), [users]);
  const adminUsers = useMemo(() => users.filter((user) => user.role === "admin"), [users]);

  const addCaName = () => {
    const trimmed = caInput.trim();
    if (!trimmed) return;
    if (caNames.includes(trimmed)) {
      setCaInput("");
      return;
    }
    setCaNames((prev) => [...prev, trimmed]);
    setCaInput("");
  };

  const removeCaName = (name) => {
    setCaNames((prev) => prev.filter((value) => value !== name));
  };

  const inviteUser = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const { data, error } = await supabase.functions.invoke("inviteUser", {
        body: { email: normalizedEmail, role: "user" },
      });

      if (error) {
        throw error;
      }

      if (caNames.length > 0) {
        const latestUsers = await loadUsers();

        const targetId = data?.user_id;
        const invitedUser = latestUsers.find((user) => user.id === targetId) || latestUsers.find((user) => user.email === normalizedEmail);

        if (!invitedUser) {
          throw new Error("Invited user profile not found after refresh.");
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ ca_names: caNames })
          .eq("id", invitedUser.id);

        if (updateError) {
          throw updateError;
        }
      }

      setEmail("");
      setCaInput("");
      setCaNames([]);
      setStatus(`Invitation sent to ${normalizedEmail}`);
      await loadUsers();
    } catch (inviteError) {
      setStatus(inviteError?.message || "Failed to invite user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Invite Users</Text>
        <Text style={styles.subtitle}>Invite sales users and assign CA names.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>New Invitation</Text>
          <TextInput
            style={styles.input}
            placeholder="email@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flexInput]}
              placeholder="CA Name"
              value={caInput}
              onChangeText={setCaInput}
            />
            <Pressable style={styles.secondaryButton} onPress={addCaName}>
              <Text style={styles.secondaryButtonText}>Add</Text>
            </Pressable>
          </View>

          {caNames.length > 0 ? (
            <View style={styles.tagWrap}>
              {caNames.map((name) => (
                <Pressable key={name} style={styles.tag} onPress={() => removeCaName(name)}>
                  <Text style={styles.tagText}>{name} x</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable style={[styles.primaryButton, loading && styles.disabled]} onPress={inviteUser} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? "Inviting..." : "Send Invite"}</Text>
          </Pressable>

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sales Users ({salesUsers.length})</Text>
          {salesUsers.length === 0 ? <Text style={styles.empty}>No sales users yet.</Text> : null}
          {salesUsers.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userMeta}>CA: {(user.ca_names || []).join(", ") || "-"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admins ({adminUsers.length})</Text>
          {adminUsers.length === 0 ? <Text style={styles.empty}>No admins found.</Text> : null}
          {adminUsers.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userMeta}>{user.full_name || "-"}</Text>
            </View>
          ))}
        </View>
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
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
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
    backgroundColor: "#ffffff",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  flexInput: {
    flex: 1,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  disabled: {
    opacity: 0.7,
  },
  status: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "600",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "700",
  },
  userRow: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 8,
    gap: 2,
  },
  userEmail: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
  },
  userMeta: {
    fontSize: 11,
    color: "#64748b",
  },
  empty: {
    color: "#94a3b8",
    fontSize: 12,
  },
});
