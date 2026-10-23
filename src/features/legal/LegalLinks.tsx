import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { useConsent } from '../consent/ConsentProvider';

export const LEGAL_CONTACT_EMAIL = 'admin@localseohub.io';

const LINK = 'px-3 py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

export default function LegalLinks() {
  const { t } = useI18n();
  const { openPreferences } = useConsent();
  const items = [
    <Link key="p" to="/privacidad" className={LINK}>{t('lp_footer_privacy')}</Link>,
    <Link key="t" to="/terminos" className={LINK}>{t('lp_footer_terms')}</Link>,
    <Link key="d" to="/eliminar-datos" className={LINK}>{t('lp_footer_deletion')}</Link>,
    <button key="c" type="button" onClick={openPreferences} className={LINK}>{t('lp_footer_cookie_prefs')}</button>,
  ];
  return (
    <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-y-1">
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {item}
          {i < items.length - 1 && <span className="text-slate-300" aria-hidden="true">·</span>}
        </Fragment>
      ))}
    </nav>
  );
}
