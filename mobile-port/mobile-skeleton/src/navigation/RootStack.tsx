import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Home from '@mobile/screens/Home';
import Login from '@mobile/screens/Login';
import MyPage from '@mobile/screens/MyPage';
import Plans from '@mobile/screens/Plans';
import WebViewScreen from '@mobile/screens/WebViewScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  WebViewScreen: { path: string };
};

export type MainTabParamList = {
  Home: undefined;
  Plans: undefined;
  MyPage: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={Home} options={{ tabBarLabel: '홈' }} />
      <Tab.Screen name="Plans" component={Plans} options={{ tabBarLabel: '플랜' }} />
      <Tab.Screen name="MyPage" component={MyPage} options={{ tabBarLabel: '마이' }} />
    </Tab.Navigator>
  );
}

export function RootStack({ initialRoute }: { initialRoute: keyof RootStackParamList }) {
  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="WebViewScreen"
        component={WebViewScreen}
        options={{ headerShown: true, title: 'aib' }}
      />
    </Stack.Navigator>
  );
}
