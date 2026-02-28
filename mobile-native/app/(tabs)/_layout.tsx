import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useMe } from '@/hooks/useMe';
import { canSeeTab } from '@/lib/roleTabs';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { Role } from '@/types/api';

function TabBarIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={24} style={{ marginBottom: -2 }} {...props} />;
}

const TAB_OPTIONS: Record<
  string,
  { title: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }
> = {
  index: { title: 'Dashboard', icon: 'home' },
  team: { title: 'Team', icon: 'users' },
  tasks: { title: 'Tasks', icon: 'list' },
  schedule: { title: 'Schedule', icon: 'calendar' },
  targets: { title: 'Targets', icon: 'bullseye' },
  reports: { title: 'Reports', icon: 'bar-chart' },
  boutiques: { title: 'Boutiques', icon: 'building' },
  users: { title: 'Users', icon: 'user' },
  control: { title: 'Control', icon: 'cog' },
  notifications: { title: 'Notifications', icon: 'bell' },
  settings: { title: 'Settings', icon: 'gear' },
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { data: me } = useMe();
  const role: Role = me?.user?.role ?? 'EMPLOYEE';

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deepLink;
      if (typeof deepLink === 'string' && deepLink) {
        router.push(deepLink);
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      {Object.entries(TAB_OPTIONS).map(([name, opts]) => (
        <Tabs.Screen
          key={name}
          name={name as 'index'}
          options={{
            title: opts.title,
            tabBarIcon: ({ color }) => <TabBarIcon name={opts.icon} color={color} />,
            tabBarButton: canSeeTab(role, name) ? undefined : () => null,
          }}
        />
      ))}
    </Tabs>
  );
}
