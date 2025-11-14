import { View, Text } from 'react-native'
import {Tabs} from 'expo-router'
import React from 'react'
import { ThemeProvider } from '../ThemeContext';
const _layout = () => {
  return (
    <ThemeProvider>
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Home',headerShown: false}}/>
      <Tabs.Screen name="jeepInfo" options={{headerShown: false}}/>
      <Tabs.Screen name="profile" options={{headerShown: false}}/>
    </Tabs>
    </ThemeProvider>
  )
}

export default _layout