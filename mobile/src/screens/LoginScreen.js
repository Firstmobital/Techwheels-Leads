import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setError("");
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message || "Unable to login. Please try again.");
    }

    setIsSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>LeadConnect Login</Text>
        <Text style={styles.subtitle}>Sign in with your account to continue.</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="name@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 15,
    color: "#334155",
    marginBottom: 8,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
  },
  button: {
    marginTop: 8,
    borderRadius: 9,
    backgroundColor: "#0f172a",
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
