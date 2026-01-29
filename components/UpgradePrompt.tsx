import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SubscriptionTier } from '@/types/database';
import { TIER_INFO } from '@/types/subscription';

interface UpgradePromptProps {
  requiredTier: SubscriptionTier;
  reason: string;
  onUpgrade: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export default function UpgradePrompt({
  requiredTier,
  reason,
  onUpgrade,
  onDismiss,
  compact = false,
}: UpgradePromptProps) {
  const tierInfo = TIER_INFO[requiredTier];

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactContainer} onPress={onUpgrade}>
        <View style={styles.compactIcon}>
          <FontAwesome name="star" size={14} color="#f59e0b" />
        </View>
        <Text style={styles.compactText} numberOfLines={1}>
          {reason} - Upgrade to {tierInfo.name}
        </Text>
        <FontAwesome name="chevron-right" size={12} color="#3b82f6" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {onDismiss && (
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome name="times" size={16} color="#9ca3af" />
        </TouchableOpacity>
      )}

      <View style={styles.iconContainer}>
        <FontAwesome name="star" size={24} color="#f59e0b" />
      </View>

      <Text style={styles.title}>Upgrade to {tierInfo.name}</Text>
      <Text style={styles.reason}>{reason}</Text>

      <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
        <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
      </TouchableOpacity>
    </View>
  );
}

export function InlineUpgradePrompt({
  message,
  onPress,
}: {
  message: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.inlineContainer} onPress={onPress}>
      <FontAwesome name="lock" size={14} color="#f59e0b" />
      <Text style={styles.inlineText}>{message}</Text>
      <FontAwesome name="chevron-right" size={12} color="#3b82f6" />
    </TouchableOpacity>
  );
}

export function LimitWarning({
  current,
  max,
  label,
  onUpgrade,
}: {
  current: number;
  max: number;
  label: string;
  onUpgrade?: () => void;
}) {
  const percentage = (current / max) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = current >= max;

  if (!isNearLimit) return null;

  return (
    <View style={[styles.limitContainer, isAtLimit && styles.limitContainerAtLimit]}>
      <View style={styles.limitHeader}>
        <Text style={[styles.limitLabel, isAtLimit && styles.limitLabelAtLimit]}>
          {label}
        </Text>
        <Text style={[styles.limitCount, isAtLimit && styles.limitCountAtLimit]}>
          {current}/{max === Infinity ? '∞' : max}
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(percentage, 100)}%` },
            isAtLimit && styles.progressFillAtLimit,
          ]}
        />
      </View>

      {isAtLimit && onUpgrade && (
        <TouchableOpacity style={styles.limitUpgradeButton} onPress={onUpgrade}>
          <Text style={styles.limitUpgradeText}>Upgrade for more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    alignItems: 'center',
  },
  dismissButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  reason: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  upgradeButton: {
    width: '100%',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
  },
  compactIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactText: {
    flex: 1,
    fontSize: 13,
    color: '#4b5563',
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  inlineText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
  },
  limitContainer: {
    padding: 12,
    backgroundColor: '#fff7ed',
    borderRadius: 10,
  },
  limitContainerAtLimit: {
    backgroundColor: '#fef2f2',
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  limitLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9a3412',
  },
  limitLabelAtLimit: {
    color: '#b91c1c',
  },
  limitCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9a3412',
  },
  limitCountAtLimit: {
    color: '#b91c1c',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#fed7aa',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f97316',
    borderRadius: 3,
  },
  progressFillAtLimit: {
    backgroundColor: '#ef4444',
  },
  limitUpgradeButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  limitUpgradeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
