<script lang="ts">
  // Shared settings on/off control. Preserve native keyboard and label behavior.
  let { checked, disabled = false, onchange }: {
    checked: boolean;
    disabled?: boolean;
    onchange: (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => void;
  } = $props();
</script>
<input class="native-toggle" type="checkbox" role="switch" {checked} {disabled} {onchange} />
<style>
  .native-toggle {
    box-sizing: border-box;
    width: 28px;
    height: 16px;
    margin: 0;
    display: block;
    position: relative;
    flex: 0 0 28px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--color-border-strong);
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    transition: background var(--motion-fast) var(--motion-easing);
  }

  .native-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-surface);
    box-shadow: 0 1px 2px color-mix(in srgb, black 24%, transparent);
    transition: transform var(--motion-fast) var(--motion-easing);
  }

  .native-toggle:checked {
    background: var(--color-accent);
  }

  .native-toggle:checked::after {
    transform: translateX(12px);
    background: var(--color-accent-fg);
  }

  .native-toggle:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
  }

  .native-toggle:disabled { opacity: .5; cursor: not-allowed; }
  .native-toggle:hover:not(:disabled) { filter: brightness(1.08); }
  @media (prefers-reduced-motion: reduce) {
    .native-toggle, .native-toggle::after { transition: none; }
  }
</style>
