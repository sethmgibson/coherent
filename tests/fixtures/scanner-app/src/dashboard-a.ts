export interface DashboardReadModel {
  id: string;
  title: string;
}

export class SqlDashboardReadModel implements DashboardReadModel {
  id = "";
  title = "";
}
