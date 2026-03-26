const rockittIconUrl = chrome.runtime.getURL('rockitt.png');

type RockittPageToggleProps = {
  direction?: 'down' | 'up';
  label: string;
  onPress: () => void;
};

export function RockittPageToggle({
  direction = 'up',
  label,
  onPress,
}: RockittPageToggleProps) {
  return (
    <button
      aria-label={label}
      className={`mode-toggle${direction === 'down' ? ' mode-toggle--down' : ''}`}
      type="button"
      onClick={onPress}
    >
      <img
        alt=""
        className="mode-toggle__icon"
        draggable={false}
        src={rockittIconUrl}
      />
    </button>
  );
}
