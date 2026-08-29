export interface PaymentData {
  id: string;
  amount: number;
  currency: string;
  customerId: string;
  source: string;
}

export interface CanonicalPayment {
  id: string;
  amount: number;
  currency: string;
  customerId: string;
  source: string;
  createdAt: string;
}

export interface UnrelatedConfig {
  host: string;
  port: number;
  tls: boolean;
}

export interface WidgetView {
  widgetId: string;
  label: string;
  color: string;
  weight: number;
}

export interface WidgetRow {
  widgetId: string;
  label: string;
  color: string;
  weight: number;
}

export interface WidgetCopy {
  widgetId: string;
  label: string;
  color: string;
  weight: number;
}
