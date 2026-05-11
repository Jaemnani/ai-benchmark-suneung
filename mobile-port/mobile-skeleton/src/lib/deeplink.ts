import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';

type RootParamList = {
  Home: undefined;
  Login: undefined;
  MyPage: undefined;
  Plans: undefined;
  WebViewScreen: { path: string };
};

const NATIVE_PATHS: Record<string, keyof RootParamList> = {
  '/': 'Home',
  '/mypage': 'MyPage',
  '/plans': 'Plans',
  '/login': 'Login',
};

const LOCALE_PREFIX = /^\/(ko|ja|en)(?=\/|$)/;

export function parseUrlToRoute(url: string):
  | { screen: keyof RootParamList; params?: RootParamList[keyof RootParamList] } {
  try {
    const u = new URL(url);
    const cleaned = u.pathname.replace(LOCALE_PREFIX, '') || '/';
    if (NATIVE_PATHS[cleaned]) {
      return { screen: NATIVE_PATHS[cleaned] };
    }
    return { screen: 'WebViewScreen', params: { path: u.pathname + u.search } };
  } catch {
    return { screen: 'Home' };
  }
}

export function attachLinkingListener(
  navRef: NavigationContainerRef<RootParamList>,
) {
  void Linking.getInitialURL().then((url) => {
    if (url) navigateTo(navRef, url);
  });
  const sub = Linking.addEventListener('url', ({ url }) => {
    navigateTo(navRef, url);
  });
  return () => sub.remove();
}

function navigateTo(
  navRef: NavigationContainerRef<RootParamList>,
  url: string,
) {
  const route = parseUrlToRoute(url);
  if (route.screen === 'WebViewScreen' && route.params) {
    navRef.navigate('WebViewScreen', route.params);
  } else if (route.screen !== 'WebViewScreen') {
    navRef.navigate(route.screen);
  }
}
