// app/_layout.js
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";

import { AuthProvider } from "../src/context/AuthContext";
import { OrdenesTecnicoProvider } from "../src/context/OrdenesTecnicoContext";
import { UbicacionProvider } from "../src/context/UbicacionContext";
import { DrawerProvider } from "../src/context/DrawerContext";
import SideDrawer from "../src/components/SideDrawer";
import { OfflineProvider } from "../src/offline/OfflineProvider";

import AnimatedSplashVideo from "../src/components/AnimatedSplashVideo";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  useEffect(() => {
    async function prepareApp() {
      try {
        // Aquí puedes cargar fuentes, sesión, datos iniciales, etc.
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        console.log("Error preparando la app:", error);
      } finally {
        setAppReady(true);

        // Oculta el splash nativo de Expo
        await SplashScreen.hideAsync();
      }
    }

    prepareApp();
  }, []);

  if (!appReady || showAnimatedSplash) {
    return (
      <AnimatedSplashVideo
        onFinish={() => setShowAnimatedSplash(false)}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <OfflineProvider>
        <AuthProvider>
          <OrdenesTecnicoProvider>
            <UbicacionProvider>
              <DrawerProvider>
                <SafeAreaView
                  style={{
                    flex: 1,
                    backgroundColor: "#fff",
                  }}
                  edges={["top", "bottom"]}
                >
                  <View style={{ flex: 1 }}>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                      }}
                    />

                    <SideDrawer />
                  </View>
                </SafeAreaView>
              </DrawerProvider>
            </UbicacionProvider>
          </OrdenesTecnicoProvider>
        </AuthProvider>
      </OfflineProvider>
    </SafeAreaProvider>
  );
}