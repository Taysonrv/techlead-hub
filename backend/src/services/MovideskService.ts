import axios from "axios";
import { MovideskJsonImportService } from "./MovideskJsonImportService";

export class MovideskService {

    private readonly url =
        process.env.MOVIDESK_URL?.trim() ||
        "https://api.movidesk.com/public/v1";

    private token() {
        const token = process.env.MOVIDESK_TOKEN?.trim();

        if (!token) {
            throw new Error(
                "A integração de escrita do Movidesk não está configurada. Informe MOVIDESK_TOKEN nas configurações do aplicativo."
            );
        }

        return token;
    }

    async getTickets() {

        const response = await axios.get(
            `${this.url}/tickets`,
            {
                params: {

                    token: this.token(),

                    $select: [
                        "id", "protocol", "subject", "category", "urgency", "status", "baseStatus",
                        "justification", "createdDate", "lastUpdate", "lastActionDate", "resolvedIn",
                        "closedIn", "canceledIn", "reopenedIn", "actionCount", "resolvedInFirstCall",
                        "ownerTeam", "serviceFirstLevel", "serviceSecondLevel", "serviceThirdLevel",
                        "slaAgreement", "slaAgreementRule", "slaSolutionTime", "slaResponseTime",
                        "slaSolutionDate", "slaResponseDate", "slaRealResponseDate",
                        "slaSolutionDateIsPaused", "lifeTimeWorkingTime", "stoppedTime",
                        "stoppedTimeWorkingTime", "origin", "isDeleted"
                    ].join(","),
                    $expand: [
                        "owner", "createdBy", "clients", "actions", "ownerHistories",
                        "statusHistories", "satisfactionSurveyResponses", "customFieldValues"
                    ].join(","),
                    $top: 1000,
                },
                timeout: 120_000,
            }
        );

        return response.data;

    }

    async syncTickets(userId?: number | null) {
        const tickets = await this.getTickets();
        return new MovideskJsonImportService().execute(
            Buffer.from(JSON.stringify(tickets), "utf8"),
            {
                fileName: "API Movidesk",
                userId: userId ?? null,
                source: "MOVIDESK_API",
            },
        );
    }

    async updateTicketStatus(
        ticketId: number,
        status: string,
        justification?: string | null,
    ) {
        const response = await axios.patch(
            `${this.url}/tickets`,
            {
                status,
                ...(justification?.trim()
                    ? { justification: justification.trim() }
                    : {}),
            },
            {
                params: {
                    token: this.token(),
                    id: ticketId,
                },
                timeout: 30_000,
            },
        );

        return response.data;
    }

}
