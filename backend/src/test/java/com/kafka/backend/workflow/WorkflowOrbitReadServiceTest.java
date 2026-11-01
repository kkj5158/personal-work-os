package com.kafka.backend.workflow;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class WorkflowOrbitReadServiceTest {
    @Test void supportedStatusesAreCanonicalAndCaseInsensitive() {
        assertThat(WorkflowOrbitReadService.status("waiting", WorkflowRows.TASK_STATUSES)).isEqualTo("WAITING");
        assertThat(WorkflowOrbitReadService.status("active", WorkflowRows.PROJECT_STATUSES)).isEqualTo("ACTIVE");
        assertThat(WorkflowOrbitReadService.status(null, WorkflowRows.TASK_STATUSES)).isNull();
    }

    @Test void invalidStatusIsRejectedInsteadOfProducingMisleadingEmptyResults() {
        assertThatThrownBy(() -> WorkflowOrbitReadService.status("PENDING", WorkflowRows.TASK_STATUSES))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> WorkflowOrbitReadService.status("WAITING", WorkflowRows.PROJECT_STATUSES))
                .isInstanceOf(InvalidRequestException.class);
    }
}
