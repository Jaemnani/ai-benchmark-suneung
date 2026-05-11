import { Share } from 'react-native';

export async function shareContent(payload: {
  title?: string;
  message: string;
  url?: string;
}): Promise<boolean> {
  try {
    const result = await Share.share({
      title: payload.title,
      message: payload.url ? `${payload.message}\n${payload.url}` : payload.message,
      url: payload.url,
    });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
