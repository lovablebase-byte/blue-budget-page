import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BrandingData {
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  site_title: string;
  custom_domain: string | null;
  primary_color: string;
}

const defaultBranding: BrandingData = {
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  site_title: 'Painel',
  custom_domain: null,
  primary_color: '221 83% 53%',
};

const BrandingContext = createContext<BrandingData>(defaultBranding);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { company } = useAuth();
  const [branding, setBranding] = useState<BrandingData>(defaultBranding);

  useEffect(() => {
    if (!company?.id) return;
    
    const fetch = async () => {
      const { data } = await supabase
        .from('company_branding')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();
      
      if (data) {
        setBranding({
          logo_light_url: data.logo_light_url,
          logo_dark_url: data.logo_dark_url,
          favicon_url: data.favicon_url,
          site_title: data.site_title || 'Painel',
          custom_domain: data.custom_domain,
          primary_color: data.primary_color || '221 83% 53%',
        });
      }
    };
    fetch();
  }, [company?.id]);

  // Apply branding dynamically
  useEffect(() => {
    // Primary color
    document.documentElement.style.setProperty('--primary', branding.primary_color);
    
    // Site title
    document.title = branding.site_title;

    // Favicon
    if (branding.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }
  }, [branding]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
