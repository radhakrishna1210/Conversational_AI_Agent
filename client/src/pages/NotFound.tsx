import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { RzEmpty } from '@/components/rz';
import { isLoggedIn, isAdminRole } from '@/lib/authStorage';

/**
 * The catch-all route. Without it an unknown URL — a mistyped link, a page that
 * was removed — matched nothing and rendered a blank screen, which reads as the
 * app being broken rather than the address being wrong.
 */
export default function NotFound() {
  const { pathname } = useLocation();
  const home = isLoggedIn() ? (isAdminRole() ? '/admin' : '/dashboard') : '/';

  return (
    <div className="rz-page rz-page-pad" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <RzEmpty
        icon={<Compass size={22} />}
        title="Page not found"
        text={<>There's nothing at <code>{pathname}</code>. The link may be mistyped, or the page may have moved.</>}
        action={
          <Link className="rz-btn rz-btn-primary" to={home}>
            {home === '/' ? 'Back to home' : 'Back to your dashboard'}
          </Link>
        }
      />
    </div>
  );
}
