import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import InviteUsersScreen from './src/screens/InviteUsersScreen';
import TemplatesScreen from './src/screens/TemplatesScreen';

// Respect user accessibility font-size settings across the app.
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = true;

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.allowFontScaling = true;

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();
  const [activeScreen, setActiveScreen] = useState('home');

  useEffect(() => {
    setActiveScreen('home');
  }, [isAuthenticated, user?.id]);

  if (isLoadingAuth) {
    return (
      <SafeAreaView style={styles.loadingSafeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      {isAuthenticated ? (
        user?.role === 'admin' ? (
          <SafeAreaView style={styles.appSafeArea}>
            <View style={styles.appContainer}>
              <View style={styles.screenContainer}>
                {activeScreen === 'home' ? <HomeScreen /> : null}
                {activeScreen === 'invite' ? <InviteUsersScreen /> : null}
                {activeScreen === 'templates' ? <TemplatesScreen /> : null}
              </View>

              <View style={styles.tabBar}>
                <Pressable
                  style={[styles.tabButton, activeScreen === 'home' && styles.tabButtonActive]}
                  onPress={() => setActiveScreen('home')}
                >
                  <Text style={[styles.tabText, activeScreen === 'home' && styles.tabTextActive]}>Home</Text>
                </Pressable>
                <Pressable
                  style={[styles.tabButton, activeScreen === 'invite' && styles.tabButtonActive]}
                  onPress={() => setActiveScreen('invite')}
                >
                  <Text style={[styles.tabText, activeScreen === 'invite' && styles.tabTextActive]}>Invite</Text>
                </Pressable>
                <Pressable
                  style={[styles.tabButton, activeScreen === 'templates' && styles.tabButtonActive]}
                  onPress={() => setActiveScreen('templates')}
                >
                  <Text style={[styles.tabText, activeScreen === 'templates' && styles.tabTextActive]}>Templates</Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        ) : (
          <HomeScreen />
        )
      ) : (
        <LoginScreen />
      )}
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appSafeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#0f172a',
  },
  tabText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
});
