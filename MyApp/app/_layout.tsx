import { Stack } from "expo-router";
import React from "react";
import { ThemeProvider } from "./ThemeContext";
import "./globals.css";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* The 'index' route will act as our Auth Check */}
        <Stack.Screen name="index" /> 
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        {/* The main app lives here */}
        <Stack.Screen name="(tabs)" /> 
      </Stack>
    </ThemeProvider>
  );
}