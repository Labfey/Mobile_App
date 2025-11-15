import { View, Text, ImageBackground } from 'react-native'
import {Tabs} from 'expo-router'
import React from 'react'
import { ThemeProvider } from '../ThemeContext';
import {images} from "@/constants/images";
const _layout = () => {
  return (
    <ThemeProvider>
    <Tabs>
      <Tabs.Screen name="index" 
      options={{
        title: 'Home',
        headerShown: false,
        tabBarIcon: ({focused}) => {
          return (
            <>
            <ImageBackground 
            source={images.highlight}
            >

            </ImageBackground>
            </>
          )
        }
        }}/>



      <Tabs.Screen name="jeepInfo" options={{headerShown: false}}/>
      <Tabs.Screen name="profile" options={{headerShown: false}}/>
      <Tabs.Screen name="settings" options={{headerShown: false}}/>
      <Tabs.Screen name='jeep/[id]' options={{headerShown: false}}/>
    </Tabs>
    </ThemeProvider>
  )
}

export default _layout