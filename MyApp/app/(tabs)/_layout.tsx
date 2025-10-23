import { View, Text } from 'react-native'
import {Tabs} from 'expo-router'
import React from 'react'

const _layout = () => {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Home',headerShown: false}}/>
      <Tabs.Screen name="jeepInfo" options={{headerShown: false}}/>
      <Tabs.Screen name="profile" options={{headerShown: false}}/>
    </Tabs>
  )
}

export default _layout