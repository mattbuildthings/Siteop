/* @ds-bundle: {"format":4,"namespace":"SiteOpsDesignSystem_019e16","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"NoteCard","sourcePath":"components/notes/NoteCard.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"9c2a84cd433e","components/core/Button.jsx":"3b9a4a98f499","components/core/Card.jsx":"e91429c64daa","components/feedback/Toast.jsx":"dd657443e289","components/feedback/Tooltip.jsx":"5fb0d57e0e1b","components/forms/Checkbox.jsx":"19d67980474a","components/forms/Input.jsx":"16b7c3916ab7","components/forms/Radio.jsx":"a2f4e9a522ab","components/forms/Select.jsx":"fad285698b08","components/forms/Switch.jsx":"1f13b25a949a","components/navigation/Tabs.jsx":"6e5c40bf4499","components/notes/NoteCard.jsx":"21dc774cf28d","components/overlay/Dialog.jsx":"b48def62a453"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SiteOpsDesignSystem_019e16 = window.SiteOpsDesignSystem_019e16 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function Badge({
  tone = 'neutral',
  children
}) {
  const tones = {
    neutral: {
      bg: 'var(--gray-200)',
      fg: 'var(--gray-700)'
    },
    primary: {
      bg: 'var(--teal-100)',
      fg: 'var(--teal-700)'
    },
    success: {
      bg: '#E4EFE5',
      fg: 'var(--color-success)'
    },
    warning: {
      bg: 'var(--orange-100)',
      fg: 'var(--orange-700)'
    },
    danger: {
      bg: '#F6DEDC',
      fg: 'var(--color-danger)'
    }
  };
  const t = tones[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 22,
      padding: '0 8px',
      borderRadius: 'var(--radius-pill)',
      background: t.bg,
      color: t.fg,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-2xs)',
      fontWeight: 'var(--fw-semibold)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--ls-caps)'
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon = null,
  children,
  onClick
}) {
  const sizes = {
    sm: {
      h: 32,
      fs: 'var(--fs-sm)',
      px: 'var(--space-3)'
    },
    md: {
      h: 40,
      fs: 'var(--fs-md)',
      px: 'var(--space-4)'
    },
    lg: {
      h: 48,
      fs: 'var(--fs-lg)',
      px: 'var(--space-5)'
    }
  };
  const s = sizes[size];
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-on-primary)',
      border: 'none'
    },
    accent: {
      background: 'var(--color-accent)',
      color: 'var(--color-on-accent)',
      border: 'none'
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      border: 'var(--border-width-strong) solid var(--color-border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary)',
      border: 'none'
    },
    danger: {
      background: 'var(--color-danger)',
      color: '#fff',
      border: 'none'
    }
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    height: s.h,
    padding: `0 ${s.px}`,
    fontFamily: 'var(--font-body)',
    fontSize: s.fs,
    fontWeight: 'var(--fw-semibold)',
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background var(--duration-fast) var(--ease-standard)`,
    ...variants[variant]
  };
  return /*#__PURE__*/React.createElement("button", {
    style: base,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: e => {
      if (!disabled && variant === 'primary') e.currentTarget.style.background = 'var(--color-primary-hover)';
      if (!disabled && variant === 'accent') e.currentTarget.style.background = 'var(--color-accent-hover)';
    },
    onMouseLeave: e => {
      if (variant === 'primary') e.currentTarget.style.background = 'var(--color-primary)';
      if (variant === 'accent') e.currentTarget.style.background = 'var(--color-accent)';
    }
  }, icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function Card({
  children,
  padding = 'var(--space-5)'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-surface)',
      border: 'var(--border-width) solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function Toast({
  tone = 'primary',
  children
}) {
  const tones = {
    primary: {
      bg: 'var(--teal-800)'
    },
    success: {
      bg: 'var(--color-success)'
    },
    danger: {
      bg: 'var(--color-danger)'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      borderRadius: 'var(--radius-md)',
      background: tones[tone].bg,
      color: '#fff',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-medium)',
      boxShadow: 'var(--shadow-lg)'
    }
  }, children);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function Tooltip({
  label,
  children
}) {
  const [show, setShow] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block'
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, children, show && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 'calc(100% + 6px)',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--gray-900)',
      color: '#fff',
      fontSize: 'var(--fs-2xs)',
      padding: '4px 8px',
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)'
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  checked,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-md)',
      color: 'var(--color-text-primary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 'var(--radius-sm)',
      border: `var(--border-width-strong) solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
      background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 6l3.5 3.5L11 2",
    stroke: "#fff",
    strokeWidth: "2",
    fill: "none"
  }))), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    onChange: onChange,
    style: {
      display: 'none'
    }
  }), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  type = 'text'
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-body)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--color-text-primary)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    type: type,
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    style: {
      height: 44,
      padding: '0 var(--space-3)',
      fontSize: 'var(--fs-md)',
      fontFamily: 'var(--font-body)',
      border: `var(--border-width-strong) solid ${error ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      outline: 'none'
    },
    onFocus: e => e.currentTarget.style.borderColor = 'var(--color-focus-ring)',
    onBlur: e => e.currentTarget.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-border-strong)'
  }), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--color-danger)'
    }
  }, error));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function Radio({
  label,
  checked,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-md)',
      color: 'var(--color-text-primary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: `var(--border-width-strong) solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'var(--color-primary)'
    }
  })), /*#__PURE__*/React.createElement("input", {
    type: "radio",
    checked: checked,
    onChange: onChange,
    style: {
      display: 'none'
    }
  }), label);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function Select({
  label,
  options = [],
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-body)'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--color-text-primary)'
    }
  }, label), /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: onChange,
    style: {
      height: 44,
      padding: '0 var(--space-3)',
      fontSize: 'var(--fs-md)',
      fontFamily: 'var(--font-body)',
      border: 'var(--border-width-strong) solid var(--color-border-strong)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  checked,
  onChange,
  label
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-md)',
      color: 'var(--color-text-primary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: onChange,
    style: {
      width: 40,
      height: 24,
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--color-primary)' : 'var(--gray-300)',
      position: 'relative',
      transition: 'background var(--duration-fast) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: checked ? 18 : 2,
      width: 20,
      height: 20,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--duration-fast) var(--ease-standard)'
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  tabs = [],
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)',
      borderBottom: 'var(--border-width) solid var(--color-border)',
      fontFamily: 'var(--font-body)'
    }
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => onChange && onChange(t),
    style: {
      background: 'none',
      border: 'none',
      padding: '10px 2px',
      fontSize: 'var(--fs-md)',
      fontWeight: 'var(--fw-semibold)',
      color: t === active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
      borderBottom: t === active ? 'var(--border-width-strong) solid var(--color-primary)' : 'var(--border-width-strong) solid transparent',
      cursor: 'pointer'
    }
  }, t)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/notes/NoteCard.jsx
try { (() => {
function NoteCard({
  type = 'photo',
  thumbnail,
  title,
  timestamp,
  author,
  synced = true
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      padding: 'var(--space-3)',
      background: 'var(--color-surface)',
      border: 'var(--border-width) solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--gray-200)',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-text-tertiary)',
      overflow: 'hidden'
    }
  }, thumbnail ? /*#__PURE__*/React.createElement("img", {
    src: thumbnail,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : type === 'audio' ? '🎤' : '📷'), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-md)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--color-text-primary)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--color-text-secondary)',
      fontFamily: 'var(--font-mono)',
      marginTop: 2
    }
  }, timestamp, " \xB7 ", author)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-2xs)',
      color: synced ? 'var(--color-success)' : 'var(--color-warning)',
      fontWeight: 'var(--fw-semibold)',
      alignSelf: 'flex-start'
    }
  }, synced ? 'SYNCED' : 'PENDING'));
}
Object.assign(__ds_scope, { NoteCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/notes/NoteCard.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
function Dialog({
  title,
  children,
  onClose,
  footer
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(18,39,38,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      width: 360,
      padding: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--fs-xl)',
      textTransform: 'uppercase'
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      fontSize: 20,
      cursor: 'pointer',
      color: 'var(--color-text-secondary)'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--color-text-secondary)',
      fontSize: 'var(--fs-md)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-5)',
      display: 'flex',
      gap: 'var(--space-3)',
      justifyContent: 'flex-end'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.NoteCard = __ds_scope.NoteCard;

__ds_ns.Dialog = __ds_scope.Dialog;

})();
